# Produce a portable HTML file from the three source assets. No dependencies.
$ErrorActionPreference = 'Stop'
$studioRoot = $PSScriptRoot
$studioHtml = [System.IO.File]::ReadAllText((Join-Path $studioRoot 'index.html'))
$studioCss = [System.IO.File]::ReadAllText((Join-Path $studioRoot 'styles.css'))
$studioEngine = [System.IO.File]::ReadAllText((Join-Path $studioRoot 'color-engine.js'))
$studioApp = [System.IO.File]::ReadAllText((Join-Path $studioRoot 'app.js'))
$studioHtml = $studioHtml.Replace('<link rel="stylesheet" href="styles.css">', "<style>`n$studioCss`n</style>")
$studioHtml = $studioHtml.Replace('<script src="color-engine.js"></script>', "<script>`n$studioEngine`n</script>")
$studioHtml = $studioHtml.Replace('<script src="app.js"></script>', "<script>`n$studioApp`n</script>")
$studioOutput = Join-Path $studioRoot '色彩实验室.html'
[System.IO.File]::WriteAllText($studioOutput, $studioHtml, [System.Text.UTF8Encoding]::new($false))
Write-Output "Built: $studioOutput"
