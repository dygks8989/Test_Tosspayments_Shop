# Local static server (no Node/Python needed)
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1   ->  http://localhost:5500
param([int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 5500 }))

$root = $PSScriptRoot
$types = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"; ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json"; ".svg" = "image/svg+xml"; ".png" = "image/png"; ".jpg" = "image/jpeg"; ".ico" = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving at http://localhost:$Port/  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
      if ($path -eq "") { $path = "index.html" }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if ($file.StartsWith($root) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
        [byte[]]$bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $type = $types[$ext]
        if (-not $type) { $type = "application/octet-stream" }
        $res.ContentType = $type
        if ($ctx.Request.HttpMethod -ne "HEAD") { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $res.StatusCode = 404
      }
      Write-Host "$($ctx.Request.HttpMethod) /$path $($res.StatusCode)"
    } catch {
      Write-Host "Error: $_"
    } finally {
      $res.Close()
    }
  }
} finally {
  $listener.Stop()
}
