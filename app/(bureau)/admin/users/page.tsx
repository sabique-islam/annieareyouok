import { ActiveToggle, UserAdmin } from "@/components/users/UserAdmin";
import { listUsers } from "@/lib/admin/desk";
import { when } from "@/lib/shared/format";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const users = await listUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1>Users</h1>
      </div>
      <UserAdmin />
      <div className="sheet overflow-x-auto">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Opened</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.user_id}>
                <td>{user.full_name}</td>
                <td className="mono text-sm">{user.email}</td>
                <td>{user.role_name}</td>
                <td>{user.is_active ? "active" : "inactive"}</td>
                <td>{when(user.created_at)}</td>
                <td><ActiveToggle userId={user.user_id} isActive={user.is_active} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
