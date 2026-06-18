import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ChatThreadProvider } from '../contexts/ChatThreadContext';
import { LoreKeeperProvider } from '../contexts/LoreKeeperContext';
import { MockDataProvider } from '../contexts/MockDataContext';
import { CurrentContextProvider } from '../contexts/CurrentContextContext';
import { ReduxProvider } from '../store/ReduxProvider';

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <ReduxProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ChatThreadProvider>
          <MockDataProvider>
            <LoreKeeperProvider>
              <CurrentContextProvider>{children}</CurrentContextProvider>
            </LoreKeeperProvider>
          </MockDataProvider>
        </ChatThreadProvider>
      </BrowserRouter>
    </ReduxProvider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };
