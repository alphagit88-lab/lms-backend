
$url = "https://raw.githubusercontent.com/frappe/fonts/master/NotoSansSinhala-Regular.ttf"
$output = "d:\Work projects\lms-project\lms-backend\src\assets\fonts\NotoSansSinhala.ttf"
New-Item -ItemType Directory -Force -Path (Split-Path $output)
Invoke-WebRequest -Uri $url -OutFile $output
Write-Host "Downloaded Sinhala font to $output"

$url2 = "https://raw.githubusercontent.com/frappe/fonts/master/NotoSansTamil-Regular.ttf"
$output2 = "d:\Work projects\lms-project\lms-backend\src\assets\fonts\NotoSansTamil.ttf"
Invoke-WebRequest -Uri $url2 -OutFile $output2
Write-Host "Downloaded Tamil font to $output2"

$url3 = "https://raw.githubusercontent.com/frappe/fonts/master/NotoSans-Regular.ttf"
$output3 = "d:\Work projects\lms-project\lms-backend\src\assets\fonts\NotoSans.ttf"
Invoke-WebRequest -Uri $url3 -OutFile $output3
Write-Host "Downloaded English font to $output3"
