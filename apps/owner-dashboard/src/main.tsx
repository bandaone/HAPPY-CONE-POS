import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DashboardApp } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><DashboardApp /></StrictMode>);
