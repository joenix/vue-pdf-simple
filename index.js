// Use PDF
import PDFComponent from './src/pdf.vue';

// Exporting as Use
export default {
  install(app) {
    app.component('PDF', PDFComponent);
  }
};

// Exporting as Component
export const PDF = PDFComponent;
