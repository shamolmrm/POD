# Push the current branch to both GitHub accounts.
#   origin -> github.com/shamolbro/POD
#   mirror -> github.com/shamolmrm/POD
# Usage: .\scripts\push-all.ps1
# Note: git writes progress to stderr, so rely on exit codes, not $ErrorActionPreference.
$branch = git rev-parse --abbrev-ref HEAD

git push origin $branch
if ($LASTEXITCODE -ne 0) { Write-Error "Push to origin failed."; exit 1 }

gh auth switch --user shamolmrm | Out-Null
git push mirror $branch
$mirrorExit = $LASTEXITCODE
gh auth switch --user shamolbro | Out-Null
if ($mirrorExit -ne 0) { Write-Error "Push to mirror failed."; exit 1 }

Write-Host "Pushed '$branch' to origin and mirror."
