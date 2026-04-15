import "#/App.css";
import { Layout } from "#/components/Layout";
import { useApplyDocumentTheme } from "#/hooks/useApplyDocumentTheme";

function App() {
  useApplyDocumentTheme();

  return <Layout />;
}

export default App;
