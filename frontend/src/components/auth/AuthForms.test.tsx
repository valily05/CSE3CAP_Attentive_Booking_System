import { describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { server } from "@/test/server";
import { renderWithIntl } from "@/test/render";
import { SignInForm, SignUpForm, homeFor } from "./AuthForms";

async function fillSignUp(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Full name"), "Rina Test");
  await user.type(screen.getByLabelText("Email"), "rina@example.test");
  await user.type(screen.getByLabelText("Phone number"), "081234567890");
  await user.type(screen.getByLabelText("Password"), "correct horse!");
  await user.click(screen.getByRole("button",{name:/Current Country of Residence/}));
  await user.click(screen.getByRole("option",{name:"Indonesia"}));
  await user.click(screen.getByRole("button",{name:/City \/ Region of residence/}));
  await user.click(screen.getByRole("option",{name:/^Jakarta/}));
}

describe("SignUpForm", () => {
  it("leaves the check-in emails box unticked and requires the privacy policy", () => {
    renderWithIntl(<SignUpForm />);
    expect(screen.getByRole("checkbox", { name: /check-in email/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /privacy policy/ })).toBeRequired();
  });

  it("sends the form in the user's language and asks them to check their email", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post("*/api/auth/signup", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201 });
      }),
    );
    renderWithIntl(<SignUpForm />, "id");
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nama lengkap"), "Rina Test");
    await user.type(screen.getByLabelText("Email"), "rina@example.test");
    await user.type(screen.getByLabelText("Nomor telepon"), "081234567890");
    await user.type(screen.getByLabelText("Kata sandi"), "correct horse!");
    await user.click(screen.getByRole("button",{name:/Negara tempat tinggal saat ini/}));
    await user.click(screen.getByRole("option",{name:"Indonesia"}));
    await user.click(screen.getByRole("button",{name:/Kota \/ Wilayah tempat tinggal/}));
    await user.click(screen.getByRole("option",{name:/^Jakarta/}));
    await user.click(screen.getByRole("checkbox", { name: /kebijakan privasi/ }));
    await user.click(screen.getByRole("button", { name: "Buat akun" }));

    expect(await screen.findByRole("heading",{name:"Periksa kotak masuk Anda"})).toBeInTheDocument();
    expect(screen.getByText("rina@example.test",{exact:true})).toBeInTheDocument();
    expect(body).toMatchObject({ name: "Rina Test", agreedPrivacy: true, checkInConsent: false, locale: "id" });
  });

  it("shows the server's reason in plain words", async () => {
    server.use(http.post("*/api/auth/signup", () => HttpResponse.json({ error: "email_taken" }, { status: 409 })));
    renderWithIntl(<SignUpForm />);
    const user = userEvent.setup();
    await fillSignUp(user);
    await user.click(screen.getByRole("checkbox", { name: /privacy policy/ }));
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("An account with this email already exists. Try signing in.");
    expect(screen.queryByRole("link",{name:"Resend verification email"})).not.toBeInTheDocument();
    expect(screen.getByRole("link",{name:/Sign in/})).toHaveAttribute("href","/signin?next=/account/residence");
  });
});

describe("SignInForm", () => {
  it("signs in and hands over the profile", async () => {
    server.use(http.post("*/api/auth/login", () => HttpResponse.json({ role: "client", name: "Rina", email: "r@x.test" })));
    const onSignedIn = vi.fn();
    renderWithIntl(<SignInForm onSignedIn={onSignedIn} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "r@x.test");
    await user.type(screen.getByLabelText("Password"), "correct horse!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ role: "client" })));
  });

  it("explains a lockout", async () => {
    server.use(http.post("*/api/auth/login", () => HttpResponse.json({ error: "account_locked" }, { status: 423 })));
    renderWithIntl(<SignInForm onSignedIn={() => {}} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "r@x.test");
    await user.type(screen.getByLabelText("Password"), "wrong pass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong passwords. Try again in 15 minutes.");
  });

  it("sends each role to its own home, and only follows safe local links", () => {
    expect(homeFor("client", "/psychologists/p1")).toBe("/psychologists/p1");
    expect(homeFor("client", "https://evil.example/")).toBe("/bookings");
    expect(homeFor("client", "//evil.example/")).toBe("/bookings");
    expect(homeFor("psychologist")).toBe("/schedule");
    expect(homeFor("admin")).toBe("/admin");
  });
});
