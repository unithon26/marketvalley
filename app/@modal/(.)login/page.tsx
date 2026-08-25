import { LoginGate, type LoginSearchParams } from "@/components/login-gate";

export default function LoginModalPage({ searchParams }: { searchParams: LoginSearchParams }) {
  return <LoginGate modal searchParams={searchParams} />;
}
