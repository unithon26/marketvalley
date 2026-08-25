import { LoginGate, type LoginSearchParams } from "@/components/login-gate";

export default function LoginPage({ searchParams }: { searchParams: LoginSearchParams }) {
  return <LoginGate searchParams={searchParams} />;
}
