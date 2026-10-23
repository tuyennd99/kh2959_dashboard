import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Lock, LogIn } from "lucide-react";
import { loginApi } from "../../api";
import { TopNav } from "../../components/layout/TopNav";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useSessionStore } from "../../stores/session-store";

export function LoginPage() {
  const [email, setEmail] = useState("admin@datdai.local");
  const [password, setPassword] = useState("Admin@123456");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setSession = useSessionStore((s) => s.setSession);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await loginApi({ email, password });
      setSession(res);
      await navigate({ to: "/manage" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Đăng nhập không thành công",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="viz-root min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto flex max-w-md flex-col justify-center px-4 py-16">
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent-soft text-primary">
              <Lock className="size-5" />
            </div>
            <CardTitle className="text-xl">
              Đăng nhập quản trị dữ liệu
            </CardTitle>
            <CardDescription>
              Dành cho cán bộ nhập số thửa, tải file CSV và đồng bộ từ Google
              Sheet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">Email tài khoản</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full gap-2" disabled={loading}>
                <LogIn className="size-4" />
                <span>{loading ? "Đang đăng nhập..." : "Đăng nhập"}</span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
