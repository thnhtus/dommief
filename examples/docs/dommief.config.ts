import { defineConfig } from 'dommief';
export default defineConfig({ title: 'Dommief Docs', preset: 'library',
  locales: [
    { id: 'en-US', name: 'English' },
    { id: 'vi-VN', name: 'Tiếng Việt', suffix: '.vi-VN' },
  ],
});
