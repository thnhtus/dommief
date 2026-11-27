import { defineConfig } from 'dommief';
export default defineConfig({
  title: 'Acme UI',
  preset: 'library',
  docDirs: ['src', 'docs'],
  library: {
    api: 'auto',
    importName: 'acme-ui',
  },
  locales: [
    { id: 'en-US', name: 'English', suffix: '' },
    { id: 'vi-VN', name: 'Tiếng Việt', suffix: '.vi-VN' },
  ],
  // Ví dụ cố ý chỉ có bản tiếng Anh: cho phép single-locale để không cảnh báo parity.
  i18n: { allowSingleLocale: ['/*'] },
});
