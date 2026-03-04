import { LayoutDashboard, LayoutIcon, Settings, ShieldCheck, UserRound } from "lucide-react"
import React from "react"

export const APP_NAME = {
    full: "Mission Fabrication Resource",
    short: "M.F.R."
}

type NavOption = {
    link: string,
    label: string,
    icon: React.ComponentType<{ className?: string}>;
    adminOnly?: boolean;
}

export const NAV_OPTIONS: NavOption[] = [
    {
        link: "/",
        label: "Home",
        icon: LayoutIcon
    },
    {
        link: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard
    },
    {
        link: "/profile",
        label: "Profile",
        icon: UserRound
    },
    {
        link: "/admin",
        label: "Admin Dashboard",
        icon: ShieldCheck,
        adminOnly: true,
    },
    {
        link: "/settings",
        label: "Settings",
        icon: Settings,
    }
]