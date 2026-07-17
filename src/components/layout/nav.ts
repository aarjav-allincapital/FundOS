import {
  LayoutDashboard,
  Landmark,
  PieChart,
  Building2,
  Users,
  Layers,
  Camera,
  GitBranch,
  ArrowLeftRight,
  FileText,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Command Center",
    items: [
      { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/" },
      { id: "funds", label: "Funds", icon: Landmark, href: "/funds" },
      { id: "portfolio", label: "Portfolio", icon: PieChart, href: "/portfolio" },
    ],
  },
  {
    label: "Data",
    items: [
      { id: "ingest", label: "Ingest", icon: UploadCloud, href: "/ingest" },
    ],
  },
  {
    label: "Records",
    items: [
      { id: "companies", label: "Companies", icon: Building2, href: "/companies" },
      { id: "founders", label: "Founders", icon: Users, href: "/founders" },
      { id: "lots", label: "Investment Lots", icon: Layers, href: "/lots" },
      { id: "snapshots", label: "Snapshots & Logs", icon: Camera, href: "/snapshots" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { id: "pipeline", label: "Deployment & Terms", icon: GitBranch, href: "/pipeline" },
    ],
  },
  {
    label: "Operations",
    items: [
      { id: "fx", label: "FX Engine", icon: ArrowLeftRight, href: "/fx" },
      { id: "reporting", label: "Reporting", icon: FileText, href: "/reporting" },
    ],
  },
];
