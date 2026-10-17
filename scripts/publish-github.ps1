#Requires -Version 7.0
<#
Publishes only the dedicated public vizzinicoslett-code/SpeakGym repository.
Credentials come from Git Credential Manager over redirected standard input/output.
The script never accepts, prints, or writes a token. -CheckOnly makes no remote changes.
#>
[CmdletBinding()]
param([switch]$CheckOnly)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$VerbosePreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'

$projectDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$owner = 'vizzinicoslett-code'
$repositoryName = 'SpeakGym'
$repositoryPath = "/repos/$owner/$repositoryName"
$repositoryUrl = "https://github.com/$owner/$repositoryName.git"
$pagesUrl = "https://$owner.github.io/$repositoryName/"
$actionsUrl = "https://github.com/$owner/$repositoryName/actions"
$description = 'SpeakGym · 表达训练场 — 本地优先的表达能力训练 Web App / PWA'
$credentialOptions = @('-c', 'credential.helper=', '-c', 'credential.helper=manager', '-c', 'credential.interactive=never', '-c', "credential.username=$owner")
$script:step = 'local repository checks'
$script:hint = 'Check Git installation and this project directory.'
$script:httpStatus = 0
$script:apiHeaders = @{}
$credentialResult = $null
$credentialFields = @{}
$credentialToken = $null

function Stop-Publication([string]$Hint) {
  $script:hint = $Hint
  throw [System.InvalidOperationException]::new('Publication stopped.')
}

function Invoke-ProjectGit {
  param([string[]]$Arguments, [string]$InputText = '', [int]$TimeoutSeconds = 60)
  $script:httpStatus = 0
  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = 'git'
  $start.WorkingDirectory = $projectDirectory
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  foreach ($argument in $Arguments) { $start.ArgumentList.Add($argument) }
  $start.Environment['GIT_TERMINAL_PROMPT'] = '0'
  $start.Environment['GCM_INTERACTIVE'] = 'never'
  $start.Environment['GCM_GUI_PROMPT'] = '0'
  foreach ($traceName in @('GIT_TRACE', 'GIT_TRACE_CURL', 'GIT_CURL_VERBOSE', 'GIT_TRACE_PACKET', 'GCM_TRACE', 'GCM_HTTPTRACE')) {
    $start.Environment[$traceName] = '0'
  }
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $start
  try {
    [void]$process.Start()
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($InputText)
    $process.StandardInput.Close()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      $process.Kill($true)
      Stop-Publication 'Git timed out. No raw Git or credential output was displayed.'
    }
    $outputText = $outputTask.GetAwaiter().GetResult()
    [void]$errorTask.GetAwaiter().GetResult()
    return [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $outputText }
  } finally {
    $process.Dispose()
  }
}

function Invoke-ProjectApi {
  param([ValidateSet('GET', 'POST', 'PUT')][string]$Method, [string]$Path, [object]$Body = $null)
  $script:httpStatus = 0
  # All callers use fixed paths; reject accidental requests outside the one authorized repository.
  if ($Path -cne '/user' -and $Path -cne '/user/repos' -and
      $Path -cne $repositoryPath -and -not $Path.StartsWith("$repositoryPath/", [StringComparison]::Ordinal)) {
    Stop-Publication 'The API target is outside the authorized repository.'
  }
  $parameters = @{
    Uri = "https://api.github.com$Path"
    Method = $Method
    Headers = $script:apiHeaders
    SkipHttpErrorCheck = $true
    MaximumRedirection = 0
    TimeoutSec = 30
    ErrorAction = 'Stop'
  }
  if ($null -ne $Body) {
    $parameters.ContentType = 'application/json; charset=utf-8'
    $parameters.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress))
  }
  $response = Invoke-WebRequest @parameters
  $script:httpStatus = [int]$response.StatusCode
  $data = $null
  if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
    try { $data = $response.Content | ConvertFrom-Json -Depth 40 } catch { $data = $null }
  }
  return [pscustomobject]@{ Status = $script:httpStatus; Data = $data }
}

function Assert-RemoteTarget([string]$Url) {
  if ($Url -cnotmatch '^(https://github\.com/vizzinicoslett-code/SpeakGym(?:\.git)?/?|git@github\.com:vizzinicoslett-code/SpeakGym(?:\.git)?)$') {
    Stop-Publication 'An existing Git remote or URL rewrite targets a different repository. No remote was changed.'
  }
}

function Assert-RepositoryIdentity([object]$Repository) {
  if ($null -eq $Repository -or $Repository.full_name -cne "$owner/$repositoryName" -or
      $Repository.owner.login -cne $owner -or $Repository.private -ne $false -or
      $Repository.fork -ne $false -or $Repository.archived -ne $false -or $Repository.disabled -ne $false) {
    Stop-Publication 'The existing repository is not the authorized active, dedicated PUBLIC SpeakGym repository.'
  }
  if (-not ([string]$Repository.description).Contains('SpeakGym', [StringComparison]::OrdinalIgnoreCase)) {
    Stop-Publication 'The existing repository description does not identify SpeakGym; unrelated content will not be touched.'
  }
  if ($Repository.permissions.admin -ne $true -or $Repository.permissions.push -ne $true) {
    Stop-Publication 'The account needs repository administration and push rights to publish and configure Pages.'
  }
}

function Read-RepositoryText([string]$FileName) {
  $file = Invoke-ProjectApi -Method GET -Path "$repositoryPath/contents/${FileName}?ref=main"
  if ($file.Status -ne 200 -or $null -eq $file.Data -or $file.Data.encoding -cne 'base64') {
    Stop-Publication 'The existing repository cannot be identified as this SpeakGym app. Existing content was left untouched.'
  }
  return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($file.Data.content))
}

try {
  $root = Invoke-ProjectGit -Arguments @('rev-parse', '--show-toplevel')
  if ($root.ExitCode -ne 0 -or -not [string]::Equals(
      [System.IO.Path]::GetFullPath($root.Output.Trim()), $projectDirectory, [StringComparison]::OrdinalIgnoreCase)) {
    Stop-Publication 'Run this script from its original SpeakGym Git checkout.'
  }

  $script:step = 'Git Credential Manager authentication'
  $script:hint = 'Run git credential-manager github login --username vizzinicoslett-code --browser, then retry.'
  $credentialResult = Invoke-ProjectGit -Arguments ($credentialOptions + @('credential', 'fill')) -InputText "protocol=https`nhost=github.com`nusername=$owner`n`n" -TimeoutSeconds 30
  if ($credentialResult.ExitCode -eq 0) {
    foreach ($line in ($credentialResult.Output -split "`r?`n")) {
      $separator = $line.IndexOf('=')
      if ($separator -gt 0) { $credentialFields[$line.Substring(0, $separator)] = $line.Substring($separator + 1) }
    }
  }
  if (-not $credentialFields.ContainsKey('password') -or [string]::IsNullOrWhiteSpace($credentialFields['password'])) {
    Write-Host 'Authentication unavailable. Sign in with Git Credential Manager as vizzinicoslett-code, then retry. No remote changes made.'
    exit 2
  }
  $credentialToken = $credentialFields['password']
  $script:apiHeaders = @{
    Authorization = "Bearer $credentialToken"
    Accept = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent' = 'SpeakGym-dedicated-release'
  }
  $identity = Invoke-ProjectApi -Method GET -Path '/user'
  if ($identity.Status -eq 401) {
    Write-Host 'Authentication expired or unavailable (HTTP 401). Sign in again with Git Credential Manager. No remote changes made.'
    exit 2
  }
  if ($identity.Status -ne 200 -or $null -eq $identity.Data -or $identity.Data.login -cne $owner) {
    Stop-Publication 'GET /user did not confirm the exact account vizzinicoslett-code. No remote changes made.'
  }

  $script:step = 'committed main branch and remote checks'
  $script:hint = 'Commit all intended project files on main before publishing.'
  $head = Invoke-ProjectGit -Arguments @('rev-parse', '--verify', 'HEAD')
  $branch = Invoke-ProjectGit -Arguments @('branch', '--show-current')
  $state = Invoke-ProjectGit -Arguments @('status', '--porcelain', '--untracked-files=all')
  if ($head.ExitCode -ne 0 -or $branch.ExitCode -ne 0 -or $branch.Output.Trim() -cne 'main' -or
      $state.ExitCode -ne 0 -or -not [string]::IsNullOrWhiteSpace($state.Output)) {
    Stop-Publication 'A clean, committed main branch is required. No project files are committed automatically.'
  }
  $trackedWorkflow = Invoke-ProjectGit -Arguments @('ls-files', '--error-unmatch', '.github/workflows/deploy.yml')
  if ($trackedWorkflow.ExitCode -ne 0) { Stop-Publication 'The tested deployment workflow must be committed before publishing.' }
  $remotes = Invoke-ProjectGit -Arguments @('remote')
  if ($remotes.ExitCode -ne 0) { Stop-Publication 'Git remotes could not be checked.' }
  $remoteNames = @($remotes.Output -split "`r?`n" | Where-Object { $_ })
  foreach ($remoteName in $remoteNames) {
    foreach ($options in @(@('remote', 'get-url', '--all', $remoteName), @('remote', 'get-url', '--push', '--all', $remoteName))) {
      $remoteUrls = Invoke-ProjectGit -Arguments $options
      if ($remoteUrls.ExitCode -ne 0) { Stop-Publication 'An existing Git remote could not be checked.' }
      foreach ($remoteUrl in ($remoteUrls.Output.Trim() -split "`r?`n")) { Assert-RemoteTarget $remoteUrl }
    }
  }
  $resolvedPushUrl = Invoke-ProjectGit -Arguments @('ls-remote', '--get-url', $repositoryUrl)
  if ($resolvedPushUrl.ExitCode -ne 0) { Stop-Publication 'The exact push destination could not be checked.' }
  Assert-RemoteTarget $resolvedPushUrl.Output.Trim()

  $script:step = 'dedicated repository identity and Pages checks'
  $script:hint = 'Verify this account has access to the dedicated public SpeakGym repository.'
  $repository = Invoke-ProjectApi -Method GET -Path $repositoryPath
  $repositoryMissing = $repository.Status -eq 404
  if (-not $repositoryMissing) {
    if ($repository.Status -ne 200) { Stop-Publication 'Repository inspection failed; check GitHub access rights.' }
    Assert-RepositoryIdentity $repository.Data
    $contents = Invoke-ProjectApi -Method GET -Path "$repositoryPath/contents"
    if ($contents.Status -eq 200) {
      if ($repository.Data.default_branch -cne 'main') { Stop-Publication 'The existing repository has a different default branch. Existing content was left untouched.' }
      $remotePackage = Read-RepositoryText 'package.json' | ConvertFrom-Json
      $remoteReadme = Read-RepositoryText 'README.md'
      if ($remotePackage.name -cne 'speakgym' -or -not $remoteReadme.Contains('SpeakGym') -or -not $remoteReadme.Contains('表达训练场')) {
        Stop-Publication 'Existing repository content does not identify this SpeakGym app. It was left untouched.'
      }
    } elseif ($contents.Status -ne 404 -or $repository.Data.size -ne 0) {
      Stop-Publication 'The existing repository is neither a verified SpeakGym app nor a new empty repository.'
    }
    $existingPages = Invoke-ProjectApi -Method GET -Path "$repositoryPath/pages"
    if ($existingPages.Status -eq 200 -and -not [string]::IsNullOrWhiteSpace($existingPages.Data.cname)) {
      Stop-Publication 'The existing Pages site uses a custom domain. Its settings were left untouched.'
    }
    if ($existingPages.Status -notin @(200, 404)) { Stop-Publication 'Pages inspection failed; repository administration and Pages permissions are required.' }
  }

  if ($CheckOnly) {
    $presence = if ($repositoryMissing) { 'The dedicated PUBLIC repository will be created on publication.' } else { 'The existing PUBLIC SpeakGym repository passed identity checks.' }
    Write-Host "Read-only checks passed for $owner/$repositoryName. $presence"
    Write-Host 'No repository, Git remote, Pages setting, or workflow was changed.'
    exit 0
  }

  if ($repositoryMissing) {
    $script:step = 'create dedicated PUBLIC repository'
    $created = Invoke-ProjectApi -Method POST -Path '/user/repos' -Body @{
      name = $repositoryName; description = $description; private = $false; auto_init = $false
    }
    if ($created.Status -ne 201) { Stop-Publication 'Public repository creation failed; check account repository-creation rights. No existing repository was changed.' }
    Assert-RepositoryIdentity $created.Data
    Write-Host 'Created PUBLIC vizzinicoslett-code/SpeakGym.'
  }

  $script:step = 'push committed main without force'
  $script:hint = 'Git push failed. Check GitHub workflow/push authorization or a divergent remote main; no force push was attempted.'
  if ($remoteNames -cnotcontains 'origin') {
    $added = Invoke-ProjectGit -Arguments @('remote', 'add', 'origin', $repositoryUrl)
    if ($added.ExitCode -ne 0) { Stop-Publication 'The local origin remote could not be added.' }
  }
  # Use a fixed HTTPS destination rather than remote pushurl or push.default rules.
  $pushed = Invoke-ProjectGit -Arguments ($credentialOptions + @('push', $repositoryUrl, 'refs/heads/main:refs/heads/main'))
  if ($pushed.ExitCode -ne 0) { Stop-Publication $script:hint }
  Write-Host 'Pushed committed main without force.'

  $script:step = 'enable GitHub Pages with GitHub Actions'
  $script:hint = 'Source was pushed, but Pages setup could not finish. Check network, repository administration, and Pages write rights, then rerun.'
  $pages = Invoke-ProjectApi -Method GET -Path "$repositoryPath/pages"
  if ($pages.Status -eq 404) {
    $pages = Invoke-ProjectApi -Method POST -Path "$repositoryPath/pages" -Body @{ build_type = 'workflow' }
    # Another initial push workflow may have enabled Pages while this request was in flight.
    if ($pages.Status -eq 409) { $pages = Invoke-ProjectApi -Method GET -Path "$repositoryPath/pages" }
  }
  if ($pages.Status -notin @(200, 201)) { Stop-Publication 'Source was pushed, but Pages setup failed. Repository administration and Pages write rights are required; rerun after authorization.' }
  if ($null -eq $pages.Data -or $null -eq $pages.Data.PSObject.Properties['build_type'] -or $pages.Data.build_type -cne 'workflow') {
    $updated = Invoke-ProjectApi -Method PUT -Path "$repositoryPath/pages" -Body @{ build_type = 'workflow' }
    if ($updated.Status -ne 204) { Stop-Publication 'Source was pushed, but switching Pages to GitHub Actions failed. Check Pages administration rights.' }
  }

  $script:step = 'dispatch tested deployment workflow'
  $script:hint = 'Source and Pages are configured, but workflow dispatch failed. Check GitHub Actions/workflow authorization and rerun this script.'
  for ($attempt = 1; $attempt -le 6; $attempt += 1) {
    $workflow = Invoke-ProjectApi -Method GET -Path "$repositoryPath/actions/workflows/deploy.yml"
    if ($workflow.Status -eq 200) { break }
    if ($workflow.Status -ne 404 -or $attempt -eq 6) { Stop-Publication $script:hint }
    Start-Sleep -Seconds 2
  }
  $dispatch = Invoke-ProjectApi -Method POST -Path "$repositoryPath/actions/workflows/deploy.yml/dispatches" -Body @{ ref = 'main' }
  if ($dispatch.Status -notin @(200, 204)) { Stop-Publication $script:hint }
  Write-Host 'Deployment workflow requested. Its tests and build must pass before the site is published.'
  Write-Host "Repository: https://github.com/$owner/$repositoryName"
  Write-Host "Actions: $actionsUrl"
  Write-Host "Pages (available after successful deployment): $pagesUrl"
  exit 0
} catch {
  $statusText = if ($script:httpStatus -gt 0) { " HTTP $($script:httpStatus)." } else { '' }
  Write-Host "Stopped at $($script:step).$statusText $($script:hint)"
  exit 1
} finally {
  # Remove our references. Secrets were never placed in command arguments, logs, or files.
  $script:apiHeaders.Clear()
  $credentialFields.Clear()
  $credentialToken = $null
  $credentialResult = $null
}
