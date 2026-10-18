param([int]$Port = 8765)
# May chu web don gian de chay trang bao tren may (Firebase can dia chi http://localhost, khong chay duoc voi file://)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$l = New-Object Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
try { $l.Start() } catch { Write-Host "Khong mo duoc cong $Port (co the trang da dang chay)."; Start-Process "http://localhost:$Port/"; exit }
$mime = @{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.webp'='image/webp';'.ico'='image/x-icon';'.json'='application/json'}
Start-Process "http://localhost:$Port/"
Write-Host "Trang bao Thieu Nien dang chay tai http://localhost:$Port/"
Write-Host "Giu cua so nay mo trong luc doc bao. Dong cua so de tat."
while ($l.IsListening) {
  $c = $l.GetContext(); $p = [Uri]::UnescapeDataString($c.Request.Url.LocalPath)
  if ($p -eq '/') { $p = '/index.html' }
  $f = [IO.Path]::GetFullPath((Join-Path $root ($p.TrimStart('/') -replace '/','\')))
  if ($f.StartsWith($root) -and (Test-Path $f -PathType Leaf)) {
    $b = [IO.File]::ReadAllBytes($f); $e = [IO.Path]::GetExtension($f).ToLower()
    $c.Response.ContentType = if ($mime[$e]) { $mime[$e] } else { 'application/octet-stream' }
    $c.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close()
}
