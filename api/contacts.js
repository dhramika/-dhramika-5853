import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

const clean = (value, max = 2000) => String(value ?? "").trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    const result = await pool.query(`
      SELECT id, title, organization, contact_person AS "contactPerson", notes, phone, email,
             is_default AS "isDefault", highlighted, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.contacts
      ORDER BY is_default DESC, title ASC
    `);
    return res.status(200).json(result.rows);
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const title = clean(body.title, 200);
    if (!title) return res.status(400).json({ error: "A contact title is required." });

    const result = await pool.query(`
      INSERT INTO public.contacts (title, organization, contact_person, notes, phone, email, is_default, highlighted)
      VALUES ($1, $2, $3, $4, $5, $6, false, false)
      RETURNING id, title, organization, contact_person AS "contactPerson", notes, phone, email,
                is_default AS "isDefault", highlighted, created_at AS "createdAt", updated_at AS "updatedAt"
    `, [title, clean(body.organization), clean(body.contactPerson), clean(body.notes), clean(body.phone, 100), clean(body.email, 320)]);
    return res.status(201).json(result.rows[0]);
  }

  if (req.method === "PUT") {
    const body = req.body || {};
    const id = clean(body.id, 80);
    const title = clean(body.title, 200);
    if (!id || !title) return res.status(400).json({ error: "A contact id and title are required." });

    const result = await pool.query(`
      UPDATE public.contacts
      SET title = $1, organization = $2, contact_person = $3, notes = $4, phone = $5, email = $6, updated_at = now()
      WHERE id = $7::uuid
      RETURNING id, title, organization, contact_person AS "contactPerson", notes, phone, email,
                is_default AS "isDefault", highlighted, created_at AS "createdAt", updated_at AS "updatedAt"
    `, [title, clean(body.organization), clean(body.contactPerson), clean(body.notes), clean(body.phone, 100), clean(body.email, 320), id]);
    if (!result.rowCount) return res.status(404).json({ error: "Contact not found." });
    return res.status(200).json(result.rows[0]);
  }

  if (req.method === "DELETE") {
    const id = clean(req.body?.id || req.query?.id, 80);
    if (!id) return res.status(400).json({ error: "A contact id is required." });
    await pool.query("DELETE FROM public.contacts WHERE id = $1::uuid", [id]);
    return res.status(204).end();
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
