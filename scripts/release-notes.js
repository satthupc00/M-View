// Tạo nội dung GitHub Release từ src/whatsnew.json
const w = require('../src/whatsnew.json');
const d = w.date ? w.date.split('-').reverse().join('/') : '';
const grp = (t, a) => (a && a.length ? `### ${t}\n${a.map(x => `- ${x}`).join('\n')}\n\n` : '');
process.stdout.write(
  `## Mon View v${w.version}${d ? ` · ${d}` : ''}\n\n` +
  grp('Mới', w.new) + grp('Cải thiện', w.improved) + grp('Sửa lỗi', w.fixed) +
  `### Cài đặt\nTải file **MonView-Setup-${w.version}.exe** bên dưới và chạy. Nếu đã cài bản trước, app sẽ tự báo có bản mới.\n`
);
