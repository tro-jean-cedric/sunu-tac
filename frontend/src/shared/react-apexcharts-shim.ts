// react-apexcharts is CommonJS; in the Vite dev server the design system's `Chart` otherwise receives the
// module object instead of the component ("React.jsx: type is invalid"). Aliased in vite.config.ts.
// @ts-expect-error — no type declarations for the dist path
import X from 'react-apexcharts/dist/react-apexcharts.min.js';

export default X && X.__esModule ? X.default : X;
