import { Link, useNavigate } from "@tanstack/react-router";
import {
  Database,
  Layers,
  LogIn,
  LogOut,
  MapPinned,
  ShieldCheck,
} from "lucide-react";
import { Button } from "../ui/button";
import { useSessionStore } from "../../stores/session-store";

export function TopNav() {
  const session = useSessionStore((s) => s.session);
  const clearSession = useSessionStore((s) => s.clearSession);
  const navigate = useNavigate();

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-xs"
      style={{
        backgroundColor:
          "color-mix(in oklch, var(--surface-1) 92%, transparent)",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-primary-foreground"
            style={{ backgroundColor: "var(--primary)" }}
          >
            <MapPinned className="size-4" />
          </div>
          <div>
            <h1
              className="text-sm font-bold tracking-tight sm:text-base"
              style={{ color: "var(--text-primary)" }}
            >
              Sổ theo dõi dữ liệu đất đai
            </h1>
            <p
              className="hidden text-xs sm:block"
              style={{ color: "var(--text-secondary)" }}
            >
              Sản lượng số thửa thực hiện hằng ngày và tiến độ chuẩn hóa hồ sơ
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link to="/">
            {({ isActive }) => (
              <Button
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className="gap-1.5"
              >
                <Layers className="size-3.5" />
                <span>Bảng theo dõi</span>
              </Button>
            )}
          </Link>

          {session ? (
            <>
              <Link to="/manage">
                {({ isActive }) => (
                  <Button
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                  >
                    <Database className="size-3.5" />
                    <span>Nhập liệu &amp; đồng bộ</span>
                  </Button>
                )}
              </Link>
              <div
                className="hidden items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium md:flex"
                style={{
                  backgroundColor: "var(--surface-2)",
                  borderColor: "var(--gridline)",
                  color: "var(--text-primary)",
                }}
              >
                <ShieldCheck
                  className="size-3.5"
                  style={{ color: "var(--status-good)" }}
                />
                <span>{session.user.fullName}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearSession();
                  void navigate({ to: "/" });
                }}
                title="Đăng xuất"
              >
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </Button>
            </>
          ) : (
            <Link to="/login">
              <Button variant="outline" size="sm" className="gap-1.5">
                <LogIn className="size-3.5" />
                <span>Đăng nhập quản trị</span>
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
