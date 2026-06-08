import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AuthPanel } from "./ui";

export default async function SignInPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/account");
  }

  return <AuthPanel />;
}
