import {describe,it,expect} from "vitest";
import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {renderWithIntl} from "@/test/render";
import {PasswordField} from "./PasswordField";

describe("PasswordField",()=>{
 it("preserves the entered password while toggling visibility and updates the length check",async()=>{
  renderWithIntl(<PasswordField label="Password" name="password" strength required />);
  const user=userEvent.setup();const input=screen.getByLabelText("Password");
  await user.type(input,"abcdefgh");
  expect(screen.getByText("At least 8 characters")).toHaveAttribute("data-met","true");
  expect(screen.queryByText("At least one symbol (e.g. ! @ #)")).not.toBeInTheDocument();
  expect(input).toBeValid();await user.type(input,"!");expect(input).toBeValid();
  await user.click(screen.getByRole("button",{name:"Show password"}));expect(input).toHaveAttribute("type","text");expect(input).toHaveValue("abcdefgh!");
  await user.click(screen.getByRole("button",{name:"Hide password"}));expect(input).toHaveAttribute("type","password");expect(input).toHaveValue("abcdefgh!");
 });
 it("allows existing login passwords without enforcing new-account rules",async()=>{
  renderWithIntl(<PasswordField label="Password" name="password" required />);const user=userEvent.setup();await user.type(screen.getByLabelText("Password"),"existingpass");expect(screen.getByLabelText("Password")).toBeValid();expect(screen.queryByText("At least 8 characters")).not.toBeInTheDocument();
 });
 it("hides completed registration rules and restores them when unmet",async()=>{
  renderWithIntl(<PasswordField label="Password" name="password" strength hideCompletedRules required/>);const user=userEvent.setup();const input=screen.getByLabelText("Password");await user.type(input,"abcdefgh");expect(screen.queryByText("At least 8 characters")).not.toBeInTheDocument();expect(screen.queryByText("At least one symbol (e.g. ! @ #)")).not.toBeInTheDocument();await user.type(input,"!");expect(screen.queryByText("At least one symbol (e.g. ! @ #)")).not.toBeInTheDocument();expect(input).toBeValid();await user.clear(input);expect(screen.getByText("At least 8 characters")).toBeInTheDocument();expect(input).toBeInvalid();
 });
});
