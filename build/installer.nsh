; Mon View - thêm vào installer của electron-builder
; Menu chuột phải "Mở bằng Mon View (cửa sổ mới)" cho file ảnh trong Explorer,
; và đưa Mon View vào danh sách "Open with" của từng định dạng.

!macro MV_ADD EXT PROGID
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.${EXT}\shell\MonViewNewWindow" "" "Mở bằng Mon View (cửa sổ mới)"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.${EXT}\shell\MonViewNewWindow" "Icon" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.${EXT}\shell\MonViewNewWindow\command" "" '"$appExe" --new-window "%1"'
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}" ""
!macroend

!macro MV_REMOVE EXT PROGID
  DeleteRegKey SHELL_CONTEXT "Software\Classes\SystemFileAssociations\.${EXT}\shell\MonViewNewWindow"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}"
!macroend

!macro customInstall
  !insertmacro MV_ADD "png" "MonView.png"
  !insertmacro MV_ADD "jpg" "MonView.jpg"
  !insertmacro MV_ADD "jpeg" "MonView.jpg"
  !insertmacro MV_ADD "jfif" "MonView.jpg"
  !insertmacro MV_ADD "gif" "MonView.gif"
  !insertmacro MV_ADD "webp" "MonView.webp"
  !insertmacro MV_ADD "ico" "MonView.ico"
  !insertmacro MV_ADD "bmp" "MonView.bmp"
  !insertmacro MV_ADD "psd" "MonView.psd"
  !insertmacro MV_ADD "psb" "MonView.psb"
  !insertmacro MV_ADD "tga" "MonView.tga"
  !insertmacro MV_ADD "tif" "MonView.tif"
  !insertmacro MV_ADD "tiff" "MonView.tif"
  ; báo Explorer cập nhật icon theo loại file
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  !insertmacro MV_REMOVE "png" "MonView.png"
  !insertmacro MV_REMOVE "jpg" "MonView.jpg"
  !insertmacro MV_REMOVE "jpeg" "MonView.jpg"
  !insertmacro MV_REMOVE "jfif" "MonView.jpg"
  !insertmacro MV_REMOVE "gif" "MonView.gif"
  !insertmacro MV_REMOVE "webp" "MonView.webp"
  !insertmacro MV_REMOVE "ico" "MonView.ico"
  !insertmacro MV_REMOVE "bmp" "MonView.bmp"
  !insertmacro MV_REMOVE "psd" "MonView.psd"
  !insertmacro MV_REMOVE "psb" "MonView.psb"
  !insertmacro MV_REMOVE "tga" "MonView.tga"
  !insertmacro MV_REMOVE "tif" "MonView.tif"
  !insertmacro MV_REMOVE "tiff" "MonView.tif"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
