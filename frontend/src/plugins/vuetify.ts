import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { mdi } from "vuetify/iconsets/mdi";

export default createVuetify({
  components,
  directives,
  icons: {
    defaultSet: "mdi",
    sets: { mdi }
  },
  theme: {
    defaultTheme: "appTheme",
    themes: {
      appTheme: {
        dark: true,
        colors: {
          background: "#0f172a",
          surface: "#111827",
          primary: "#3b82f6",
          success: "#22c55e",
          warning: "#eab308",
          error: "#ef4444"
        }
      }
    }
  }
});
