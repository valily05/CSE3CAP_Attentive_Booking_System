import {describe,it,expect} from "vitest";
import {http,HttpResponse} from "msw";
import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {server} from "@/test/server";
import {renderWithIntl} from "@/test/render";
import {SessionProvider} from "@/components/shell/Session";
import {MyHistory} from "./MyHistory";

describe("MyHistory",()=>{
 it("shows past/closed sessions, excludes upcoming sessions and supports status/search filters",async()=>{
  const base={clientName:"Client",psychologistName:"Ayu",serviceName:"Counselling",mode:"online",onlineChannel:"video",start:"2010-01-01T00:00:00Z",end:"2010-01-01T01:00:00Z"};
  server.use(http.get("*/api/auth/me",()=>HttpResponse.json({role:"client",name:"Client",email:"client@example.test"})),http.get("*/api/me/bookings",()=>HttpResponse.json({bookings:[{...base,id:"1",code:"PAST1",status:"attended",isUrgent:true},{...base,id:"2",code:"PENDING1",status:"confirmed"},{...base,id:"3",code:"CANCEL1",status:"cancelled",start:"2099-01-01T00:00:00Z",end:"2099-01-01T01:00:00Z"},{...base,id:"4",code:"FUTURE1",status:"confirmed",start:"2099-01-01T00:00:00Z",end:"2099-01-01T01:00:00Z"}]})));
  renderWithIntl(<SessionProvider><MyHistory/></SessionProvider>);
  expect(await screen.findByText("PAST1")).toBeInTheDocument();expect(screen.getByText("URGENT")).toBeInTheDocument();expect(screen.getByText("CANCEL1")).toBeInTheDocument();expect(screen.queryByText("FUTURE1")).not.toBeInTheDocument();expect(screen.getByRole("cell",{name:"Awaiting attendance record"})).toBeInTheDocument();
  const user=userEvent.setup();await user.selectOptions(screen.getByRole("combobox"),"attended");expect(screen.queryByText("CANCEL1")).not.toBeInTheDocument();await user.type(screen.getByRole("searchbox"),"missing");expect(screen.getByText("No sessions match these filters.")).toBeInTheDocument();
 });
 it("requires sign-in before requesting session records",async()=>{
  let requests=0;server.use(http.get("*/api/auth/me",()=>HttpResponse.json({error:"unauthenticated"},{status:401})),http.get("*/api/me/bookings",()=>{requests++;return HttpResponse.json({bookings:[]});}));
  renderWithIntl(<SessionProvider><MyHistory/></SessionProvider>);expect(await screen.findByRole("link",{name:"Sign in"})).toBeInTheDocument();expect(requests).toBe(0);
 });
});
