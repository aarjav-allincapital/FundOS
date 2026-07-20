import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar, type SearchItem } from "@/components/layout/Topbar";

export function AppShell({
  searchItems,
  children,
}: {
  searchItems: SearchItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface-sunken">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar searchItems={searchItems} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
