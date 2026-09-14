import { Prisma } from '@prisma/client';

export class BulkUpdateUserUsedTrafficBuilder {
    public query: Prisma.Sql;

    constructor(list: { u: string; b: string; up?: string; down?: string; n: string }[]) {
        this.query = this.getQuery(list);
        return this;
    }

    public getQuery(
        list: { u: string; b: string; up?: string; down?: string; n: string }[],
    ): Prisma.Sql {
        if (list.length === 0) {
            return Prisma.sql`SELECT NULL::uuid AS "id" WHERE FALSE`;
        }

        const values = Prisma.join(
            list.map(
                (h) =>
                    Prisma.sql`(${h.b}::bigint, ${h.up ?? '0'}::bigint, ${h.down ?? '0'}::bigint, ${h.u}::bigint, ${h.n}::uuid)`,
            ),
        );

        return Prisma.sql`
        WITH data("inc_used","inc_upload","inc_download","id","last_connected_node_uuid") AS (
          VALUES ${values}
        ),
        locked AS (
          SELECT u."id"
          FROM data d
          JOIN "user_traffic" u ON u."id" = d."id"
          ORDER BY u."id"
          FOR UPDATE OF u
        ),
        updated_users AS (
          UPDATE "user_traffic" AS u
          SET
            "used_traffic_bytes"          = u."used_traffic_bytes" + d."inc_used",
            "lifetime_used_traffic_bytes" = u."lifetime_used_traffic_bytes" + d."inc_used",
            "used_upload_traffic_bytes" = u."used_upload_traffic_bytes" + d."inc_upload",
            "used_download_traffic_bytes" = u."used_download_traffic_bytes" + d."inc_download",
            "lifetime_upload_traffic_bytes" = u."lifetime_upload_traffic_bytes" + d."inc_upload",
            "lifetime_download_traffic_bytes" = u."lifetime_download_traffic_bytes" + d."inc_download",
            "online_at"                   = NOW(),
            "first_connected_at"          = COALESCE(u."first_connected_at", NOW()),
            "last_connected_node_uuid"    = d."last_connected_node_uuid"
          FROM data d
          JOIN locked l ON l."id" = d."id"
          WHERE d."id" = u."id"
          RETURNING
            u."id",
            (u."first_connected_at" = u."online_at") AS "isFirstConnection"
        )
        SELECT "id" AS "id"
        FROM updated_users
        WHERE "isFirstConnection";
        `;
    }
}
