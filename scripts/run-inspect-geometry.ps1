$p = Join-Path ([IO.Path]::GetTempPath()) 'product-pdf-inspection'
$env:PYTHONPATH = $p
python scripts/inspect-comparative-geometry.py
