import {RequireRole} from "@/components/shell/RequireRole";
import {ProfilePage} from "@/components/account/ProfilePage";
export default function Page(){return <RequireRole role="client"><ProfilePage/></RequireRole>}
