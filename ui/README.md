# Axton UI

Axton UI is a web-based interface for managing automated trading strategies on the Solana blockchain.

the telegram login bot is not included in this public cut.

## Architecture

The application is a single-page application (SPA) built with React, TypeScript, and Vite. It uses a secure, bot-driven authentication flow with Telegram.

### Key Technologies

- **React**: For building the user interface.
- **TypeScript**: For static typing and improved developer experience.
- **Vite**: As the build tool and development server.
- **React Router**: For handling client-side routing.
- **TanStack Query**: For managing server state, including data fetching, caching, and optimistic updates.
- **React Context**: For global state management (e.g., `AuthContext`, `CurrencyContext`).
- **Axios**: For making HTTP requests to the backend API.
- **Custom CSS Architecture**: Component-based styling system with CSS custom properties.
- **React Icons**: For icons.
- **QR Code Generation**: For wallet address display.

## Authentication

The application has replaced its previous "magic link" system with a more secure and seamless, `httpOnly` cookie-based flow initiated via a Telegram bot.

### Authentication Flow

1.  **Initiation**: The user starts the login process by interacting with the official Telegram bot.
2.  **Magic Link**: The bot calls a backend endpoint (`/tglogin`) which generates a secure, single-use magic link.
3.  **Callback**: When the user clicks the link, they are directed to a `/callback` endpoint on the API.
4.  **Cookie Issuance**: The API validates the link's token, finds or creates a user based on their `telegram_id`, and issues a JWT inside a secure, `httpOnly` `authToken` cookie.
5.  **Redirect to UI**: The user's browser is then redirected to the main application UI (e.g., `/home` or `/welcome` for first-time users).
6.  **Session Management**: The UI uses a `GET /auth/me` endpoint to verify the user's session on load. The browser automatically sends the `authToken` cookie with every request.
7.  **Logout**: Logout is handled by a `POST /auth/logout` API call, which clears the cookie on the server.

This architecture prevents client-side JavaScript from accessing the JWT, mitigating XSS risks.

## CSS Architecture

The application uses a custom CSS architecture designed for maintainability and scalability:

### Design System
- `src/styles/variables.css`: CSS custom properties for colors, typography, spacing, and design tokens.
- `src/styles/utilities/`: Utility classes for spacing, colors, and layout.
- `src/styles/components/`: Component-specific styles (buttons, forms, navigation, wallet-info, modal, tooltip, currency-toggle, etc.).
- `src/styles/pages/`: Page-specific styles.
- `src/styles/base/`: Base styles and CSS reset.

### New Component Styles (2024)
- `modal.css`: Modal overlay, positioning, and animation styles
- `deposit-modal.css`: Dedicated styles for deposit modal with QR code layout
- `tooltip.css`: Tooltip positioning, z-index, and animation styles
- `currency-toggle.css`: Tertiary button styling for currency switcher
- `smart-input.css`: Enhanced input styling with dynamic prefix width and tooltip integration

### Typography
- **Body Text**: DM Sans (sans-serif) - Clean, modern, highly readable
- **Headings**: Gabarito (sans-serif) - Modern, geometric
- **Code/Logs**: Inconsolata (monospace) - Consistent with headings

### Component Architecture

The application follows a domain-based component organization for better maintainability and scalability:

#### **UI Components** (`src/components/ui/`)
Reusable UI primitives used throughout the application:
- **Modal**: Reusable modal with tooltip integration and accessibility features
- **Tooltip**: Standard tooltip with positioning controls and delay support
- **Loader/GhostLoader**: Loading states for async operations
- **TabNavigation**: Reusable tab navigation component
- **BuySellToggle**: Toggle component for switching between buy/sell modes

#### **Form Components** (`src/components/forms/`)
All form-related components for trading operations:
- **SmartInput**: Unified input supporting preset buttons and slider interfaces with parameterized prefixes
- **BuyForm/SellForm**: Forms for one-shot buy/sell orders with validation
- **CountersellForm**: Form for creating automated countersell strategies
- **BuySellButton**: Specialized button for trade execution
- **SlippageControl**: Slippage configuration component
- **FormField/SliderField**: Reusable form field components

#### **Trading Components** (`src/components/trading/`)
Components specific to order management and trading:
- **AllOrdersList**: Complete order history across all tokens
- **OrderHistory**: Token-specific order history with expandable logs
- **OrderDetails**: Detailed view of individual orders
- **CountersellOrdersTable**: Table view for active countersell orders
- **Logs**: Execution logs with transaction signatures and Solscan links

#### **Wallet Components** (`src/components/wallet/`)
Wallet management and display components:
- **WalletSetup**: Automatic wallet creation flow for new users
- **WalletDisplay**: Display of public/private keys with QR codes
- **WalletInfo**: Wallet balance display with color-coded states
- **DepositModal**: QR code generation and deposit instructions
- **HoldingsInfo**: Combined wallet and token holdings display with real-time updates

#### **Token Components** (`src/components/token/`)
Token information and search components:
- **TokenInfo**: Token metadata display with price flash animations
- **TokenSearch**: Debounced token search with real-time results
- **SummaryStats**: Portfolio summary statistics table

#### **Layout Components** (`src/components/layout/`)
Application layout and navigation:
- **AppLayout**: Main application wrapper with navbar
- **PageLayout**: Page-level layout wrapper
- **Navbar**: Fixed navigation with wallet dropdown and currency toggle
- **NavbarSearch**: Global token search overlay
- **Header**: Page header component
- **Section**: Reusable section wrapper

#### **Shared Components** (`src/components/shared/`)
Shared utilities and cross-cutting concerns:
- **ProtectedRoute**: Authentication guard for protected routes
- **CurrencyToggle**: Global USD/SOL currency switcher
- **ProtocolIcon**: Protocol-specific icon display

## Atlas UI: Real-Time Token Visualization

The primary interface of the application is the **Atlas UI**, a real-time, interactive data visualization for monitoring new tokens on the Solana blockchain. Built with **deck.gl**, it uses a high-performance WebGL layer to render thousands of tokens as a 2D scatter plot.

### Visualization Metaphor
- **X-Axis (Horizontal)**: Represents the **token's age** in minutes. New tokens appear on the left and travel rightward over time.
- **Y-Axis (Vertical)**: Represents the **token's market cap** in SOL. Tokens move up and down this axis as their market cap changes.
- **Color & Brightness**: A token's color indicates its status (e.g., live on Pump.fun, migrated to Raydium), while its brightness is proportional to its recent trading activity (volume or transaction count).

### Technical Architecture

The Atlas UI is built with a modular, hook-based architecture that separates concerns for maintainability and performance:

#### **Real-Time Data Pipeline**
- **WebSocket Connections** (`useAtlasWebSocket`): Maintains two persistent WebSocket connections: one to `/ws` for real-time token data (snapshots and deltas), and another to `/ws/wallet` for live updates on the user's wallet status (hot/cold). The hook manages state and automatic reconnection for both streams.
- **Data Enrichment**: Raw token data is enriched with calculated age, interpolated metrics, and user holdings information before rendering.

#### **Rendering System**
- **Deck.gl Layers** (`useDeckGLLayers`): Generates WebGL layers for rendering:
  - `ScatterplotLayer`: Renders tokens as dots with position based on age (x) and market cap (y)
  - `TextLayer`: Displays market cap labels for tokens that exceed the Y-axis domain
  - `LineLayer`: Shows the migration threshold reference line
- **Smooth Animation**: Uses manual exponential interpolation for smooth, natural-feeling movement as token metrics update. Interpolation speed is configurable (default: 1.0) for optimal visual smoothness.
- **Continuous Updates**: Runs a `requestAnimationFrame` loop that updates token positions every frame, ensuring smooth 60fps animation.

#### **View State Management**
- **Camera Control** (`useAtlasViewState`): Manages pan and zoom state with boundary constraints. Uses `ResizeObserver` to adapt to container size changes and enforces viewport limits to prevent panning outside the data domain.

#### **Component Structure**
- **Atlas**: Main orchestrator component that composes hooks and child components
- **AtlasChart**: Renders the deck.gl canvas and dynamic axes
- **AtlasHUD**: Displays token information, metrics, and trading interface when a token is hovered
- **AtlasHoldingsInfo**: Shows user's position details (quantity, P&L) for tokens they own
- **DynamicAxis**: Renders axis ticks and labels that adapt to the current viewport

### Interactivity
- **Hover-Based HUD**: Hovering over any token reveals a Heads-Up Display (HUD) with detailed information, including its name, symbol, market cap, volume, transaction count, and age. The HUD is currency-aware and displays values in either **USD or SOL**. Hover directly controls token selection, while the animation loop only updates the selected token's data.
- **Integrated Trading**: The HUD includes a complete trading interface, allowing users to buy or sell tokens directly from the visualization without navigating away.
- **Holdings Display**: If the hovered token is in the user's wallet, the HUD displays real-time P&L, position value, and cost basis information.
- **Outlier Handling**: Tokens that exceed the maximum market cap of the Y-axis are clamped to the top of the chart, and their true market cap is displayed as a text label, ensuring no data is lost from view.
- **Pan & Zoom**: The entire chart is navigable, allowing users to zoom in on specific regions or pan across the token landscape. Zoom constraints prevent viewing beyond the data domain boundaries.

## Mobile First Responsive Design

The application is fully responsive and optimized for a seamless mobile experience. The design employs a single breakpoint strategy (`@media (max-width: 768px)`) to ensure consistency and maintainability.

### Key Mobile UI Patterns
- **Simplified Navbar**: On mobile, the navigation bar collapses to a minimal state, featuring a compact logo and essential navigation.
- **Bottom Tab Navigation**: The `TokenDetail` page utilizes a fixed bottom tab bar for easy switching between "Trade" and "Position" views.
- **Full-Screen Modals**: All modals, including the `Countersell` form, expand to a full-screen view on mobile to maximize usability.
- **Horizontal Scrolling**: Data-rich tables, such as the portfolio and order lists, scroll horizontally to prevent content distortion on narrow screens.

## Recent Improvements

### Hooks Refactoring (October 2024)
- **Domain-based organization**: Reorganized hooks into 4 logical directories (api, trading, analytics, ui)
- **Decomposed useOrderManagement**: Refactored monolithic hook into 5 focused hooks
- **Single Responsibility Principle**: Each hook now has a clear, focused purpose
- **Improved testability**: Smaller hooks are easier to test in isolation
- **Better composition**: Main hook composes smaller hooks for complex workflows
- **Reduced complexity**: Hooks are now significantly smaller with clear responsibilities

### Component Reorganization (October 2024)
- **Domain-based architecture**: Reorganized 39 components into 7 logical directories
- **Improved discoverability**: Components grouped by purpose (ui, forms, trading, wallet, token, layout, shared)
- **Better maintainability**: Clear patterns for where new components should be added
- **Reduced cognitive load**: Developers can quickly find related components
- **Scalable structure**: Architecture supports future growth without confusion

### CSS Refactoring (2024)
- **Removed Pico CSS dependency**: Replaced with custom CSS architecture for better control and smaller bundle size
- **Component-based styling**: Each component has its own CSS file for better maintainability
- **Design system**: Implemented CSS custom properties for consistent theming
- **Utility classes**: Created reusable utility classes for common patterns
- **Typography system**: Comprehensive typography scale with proper font loading

### Component Improvements
- **WalletInfo component**: Pure, reusable component with size variants and color states
- **Navbar refactoring**: Clean separation of concerns with proper component structure
- **Form consistency**: Standardized form styling across all pages
- **Accessibility**: Improved focus states and keyboard navigation

### Performance Optimizations
- **Bundle size reduction**: Removed unused CSS framework (~8KB savings)
- **Font optimization**: Efficient Google Fonts loading with preconnect
- **CSS organization**: Logical file structure for better maintainability
- **Component lazy loading**: Optimized component rendering and state management
- **Efficient re-renders**: Proper use of React hooks and context for minimal re-renders

### User Experience Enhancements

- **Real-Time Data Visualization**: The Atlas UI provides a live, dynamic view of the token market.
- **Visual Feedback**: Dynamic colorization for balance changes and form interactions
- **Contextual Help**: Tooltips throughout the interface for better user guidance
- **Currency Flexibility**: Seamless switching between USD and SOL display modes
- **Deposit Flow**: Streamlined wallet deposit process with QR code generation
- **Form Validation**: Enhanced input validation with real-time feedback
- **Accessibility**: Improved keyboard navigation and screen reader support

## Recent Major Updates (2024)

### UI/UX Enhancements & Component Library
- **Modal System**: Created reusable `Modal` component with tooltip integration and proper accessibility
- **Deposit Flow**: Added QR code generation and wallet address display with copy functionality
- **Tooltip Component**: Standard tooltip implementation with positioning and delay controls
- **Currency Toggle**: Global USD/SOL toggle in navbar for all currency-relevant fields
- **Dynamic Colorization**: Balance changes flash with color feedback using CSS variables
- **Enhanced SmartInput**: Parameterized prefixes, tooltip support, and improved slider controls

### TokenDetail Page Redesign
- **New Layout**: Restructured TokenDetail page with improved two-column layout
- **SummaryStats Component**: Added portfolio summary table with balance, unrealized PnL, and trading metrics
- **Modular Components**: Created reusable components (BuySellToggle, SmartInput, BuySellButton, HoldingsInfo)
- **Responsive Design**: Fully mobile-friendly layout using a single 768px breakpoint.
- **TokenInfo Restructure**: Token image on left, identity info in top row, metrics in bottom row
- **Execution Logs**: Added tooltip-enabled header with information icon

### Orders API Integration
- **API Migration**: Integrated new Orders data via the Positions API (`GET /positions/${tokenMint}`)
- **Order Management**: Updated to handle new order structure with proper status categorization
- **Status Handling**: Orders categorized by status (PENDING/ACTIVE → Open tab, COMPLETED/FAILED/CANCELLED → Historical tab)
- **Order Types**: Support for both countersell and oneshot order types with appropriate display logic

### Component Architecture Improvements
- **SmartInput Component**: Unified input component supporting both preset buttons and slider interfaces
- **BuySellToggle**: Clean toggle component for switching between buy/sell modes
- **HoldingsInfo**: Combined wallet and token holdings display with deposit modal integration
- **CurrencyContext**: Global state management for USD/SOL currency switching
- **Tooltip Integration**: Contextual help for form fields and UI elements

### CSS Architecture Enhancements
- **Component-Specific Styles**: Each new component has dedicated CSS files
- **Design System Integration**: Consistent use of CSS custom properties
- **Responsive Breakpoints**: Improved mobile and tablet layouts
- **Layout Optimization**: Fixed grid layouts with proper alignment and spacing
- **Button Variants**: Added tertiary button style for text-only buttons
- **Modal System**: Dedicated CSS for overlay, positioning, and animations

### API Integration & Data Handling
- **Currency-Aware API**: Updated to receive both USD and SOL values from API responses
- **Type Safety**: Enhanced TypeScript interfaces for market cap and volume data structures
- **Error Handling**: Robust null/undefined checks in formatters and components
- **Field Renaming**: Standardized `target_mcap_usd` field naming for consistency

### Technical Improvements
- **Type Safety**: Updated TypeScript interfaces for new Order structure and currency data
- **State Management**: Improved React Query integration with proper cache invalidation
- **Error Handling**: Better error states and loading indicators
- **Code Organization**: Cleaner separation of concerns and reusable patterns
- **Form Validation**: Enhanced input validation with decimal handling for market cap fields

### New TypeScript Interfaces
- **CurrencyContext**: Type-safe currency switching with 'USD' | 'SOL' union types
- **ModalProps**: Comprehensive modal component props with positioning and accessibility
- **Enhanced Holding**: Updated to include `market_cap` and `volume_24h` with `valueUsd`/`valueSol` structure
- **PositionData**: Extended with `valueSol` fields for all currency values
- **SmartInputProps**: Parameterized prefix and tooltip support with proper typing

### Data Structure Updates
- **API Response Format**: Updated to handle both USD and SOL values from backend
- **Market Cap Structure**: `{ valueUsd: number; valueSol: number }` for currency-aware display
- **Volume Structure**: `{ valueUsd: number; valueSol: number }` for 24h volume data
- **Field Standardization**: Renamed `market_cap_threshold_fdv_sol` to `target_mcap_usd` for clarity

## Development

### Getting Started
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
```

### Key Development Patterns
- **Domain-Based Organization**: Components organized by domain (ui, forms, trading, wallet, token, layout, shared)
- **Component-First**: Each component has its own CSS file and TypeScript interface
- **CSS Variables**: Use design system variables for consistent theming
- **Type Safety**: Comprehensive TypeScript interfaces for all data structures
- **Error Boundaries**: Graceful error handling with user-friendly fallbacks
- **Accessibility**: ARIA attributes and keyboard navigation support

### Adding New Components
When creating new components, follow this structure:
- **UI primitives** → `src/components/ui/`
- **Form components** → `src/components/forms/`
- **Trading features** → `src/components/trading/`
- **Wallet features** → `src/components/wallet/`
- **Token features** → `src/components/token/`
- **Data visualization** → `src/components/atlas/`
- **Layout components** → `src/components/layout/`
- **Shared utilities** → `src/components/shared/`

### Hooks Architecture

Custom hooks are organized by domain for better maintainability:

#### **API Hooks** (`src/hooks/api/`)
Hooks for data fetching and API interactions:
- **useTokenDetailData**: Fetches token info, wallet data, SOL balance, and position data with polling

#### **Trading Hooks** (`src/hooks/trading/`)
Hooks for order management and trading operations:
- **useOrderManagement**: Handles trade execution logic. For the Atlas UI, it sends buy/sell requests directly to the Atlas trading API. It also integrates with `useOrderCancellation` for managing countersell orders on other pages.
- **useOrderCancellation**: Handles order cancellation with optimistic updates.
- **useFormState**: Manages form state for buy/sell/countersell forms.

#### **Analytics Hooks** (`src/hooks/analytics/`)
Hooks for tracking and analytics:
- **usePageTracking**: Automatically tracks page views on route changes

#### **UI Hooks** (`src/hooks/ui/`)
Hooks for UI interactions and effects (reserved for future use)

#### **Atlas Hooks** (`src/hooks/atlas/`)
Hooks for the Atlas visualization system:
- **useAtlasWebSocket**: Manages two persistent WebSocket connections: one for real-time token data (`/ws`) and another for wallet hot/cold status (`/ws/wallet`).
- **useAtlasViewState**: Handles camera/viewport state with pan, zoom, and boundary constraints
- **useDeckGLLayers**: Generates deck.gl layers with smooth interpolation and animation
- **useAtlasHoldings**: Fetches user's token holdings for P&L calculations
