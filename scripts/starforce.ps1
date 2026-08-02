param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $AppArgs
)

$ErrorActionPreference = "Stop"

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepositoryRoot = Split-Path -Parent $ScriptDirectory
$NodeVersion = if ($env:STARFORCE_NODE_VERSION) { $env:STARFORCE_NODE_VERSION } else { "22.18.0" }
$RuntimeRoot = Join-Path $RepositoryRoot ".starforce-runtime"
$NodeDirectoryName = "node-v$NodeVersion-win-x64"
$NodeDirectory = Join-Path $RuntimeRoot $NodeDirectoryName
$NodeExecutable = Join-Path $NodeDirectory "node.exe"
$NpmCommand = Join-Path $NodeDirectory "npm.cmd"

function Install-NodeRuntime {
  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

  $ArchivePath = Join-Path $RuntimeRoot "$NodeDirectoryName.zip"
  $DownloadUrl = "https://nodejs.org/dist/v$NodeVersion/$NodeDirectoryName.zip"

  Write-Host "Downloading Node.js v$NodeVersion for Windows..."
  Invoke-WebRequest -Uri $DownloadUrl -OutFile $ArchivePath

  Write-Host "Extracting Node.js runtime..."
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $RuntimeRoot -Force
  Remove-Item -LiteralPath $ArchivePath -Force
}

if (!(Test-Path -LiteralPath $NodeExecutable)) {
  Install-NodeRuntime
}

$env:PATH = "$NodeDirectory;$env:PATH"

$TuiRunner = Join-Path $RepositoryRoot "node_modules\.bin\tsx.cmd"
if (!(Test-Path -LiteralPath $TuiRunner)) {
  Write-Host "Installing project dependencies with bundled npm..."
  & $NpmCommand "--prefix" $RepositoryRoot "ci" "--include=dev"
}

& $NpmCommand "--prefix" $RepositoryRoot "run" "start" "--" @AppArgs
exit $LASTEXITCODE
