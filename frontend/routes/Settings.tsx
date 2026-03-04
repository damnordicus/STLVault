import React from "react";
import Navbar from "../components/Navbar";
import SettingsPanel from "../components/Settings";
import Box from "@mui/material/Box";

const Settings: React.FC = () => (
  <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: "background.default" }}>
    <Navbar showMenuButton={false} />
    <SettingsPanel />
  </Box>
);

export default Settings;
