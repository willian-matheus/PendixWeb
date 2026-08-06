import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { AuthProvider } from './auth/AuthProvider';
import { ThemeProvider } from './theme/ThemeProvider';
import { AccentColorProvider } from './theme/AccentColorProvider';
import { Toaster } from 'sonner';

function App() {
  return (
    <ThemeProvider>
      <AccentColorProvider>
        <AuthProvider>
          <Toaster position="top-right" richColors />
          <RouterProvider router={router} />
        </AuthProvider>
      </AccentColorProvider>
    </ThemeProvider>
  );
}

export default App;