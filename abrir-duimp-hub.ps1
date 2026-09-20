$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $PSScriptRoot).Path
$prefix = 'http://127.0.0.1:4173/'
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "DUIMP Hub: $prefix"
Start-Process "$prefix"
try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
      $full = [IO.Path]::GetFullPath((Join-Path $root $path))
      if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $context.Response.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes('Não encontrado')
      } else {
        $bytes = [IO.File]::ReadAllBytes($full)
        $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
        $types = @{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.mjs'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.json'='application/json';'.ttf'='font/ttf';'.txt'='text/plain; charset=utf-8'}
        if ($types.ContainsKey($ext)) { $context.Response.ContentType = $types[$ext] }
      }
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.Headers['Cache-Control'] = 'no-cache'
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $context.Response.StatusCode = 500
    } finally { $context.Response.Close() }
  }
} finally { $listener.Stop() }
