import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50).default('Others'),
  price: z.number().int().min(0).max(1_000_000),
  image: z.string().trim().max(2000).default(''),
  description: z.string().trim().max(500).default(''),
  cookMinutes: z.number().int().min(1).max(240).nullable().default(null),
  isAvailable: z.boolean().default(true),
});

export const createOrderSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(4).max(20).regex(/^[0-9+\-\s]+$/, 'Invalid phone'),
    orderType: z.enum(['dine', 'takeaway']).default('dine'),
    table: z.string().trim().max(10).optional(),
    note: z.string().trim().max(500).default(''),
    // Optional device location for the in-café GPS geofence (order gate).
    // Absent when GPS isn't in use or the customer declined to share it.
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    items: z
      .array(
        z.object({
          menuItemId: z.number().int().positive(),
          qty: z.number().int().min(1).max(20),
        })
      )
      .min(1)
      .max(30),
  })
  .refine((d) => d.orderType === 'takeaway' || (d.table && d.table.length > 0), {
    message: 'Table is required for dine-in orders',
    path: ['table'],
  });

export const statusSchema = z.object({
  status: z.enum(['accepted', 'preparing', 'cooked', 'served', 'cancelled']),
});

export const settleSchema = z
  .object({
    method: z.enum(['cash', 'esewa', 'khalti', 'fonepay', 'card', 'credit']),
    // Omitted → settle the whole table. Provided → settle only these orders
    // (split bills / recovering a mixed-up tab).
    orderIds: z.array(z.number().int().positive()).min(1).max(100).optional(),
    // Bill adjustments. discountPercent wins over discount when both sent.
    discount: z.number().int().min(0).max(1_000_000).default(0),
    discountPercent: z.number().min(0).max(100).optional(),
    extraCharge: z.number().int().min(0).max(1_000_000).default(0),
    note: z.string().trim().max(200).default(''),
    // Required for method 'credit': who owes this money.
    creditCustomer: z
      .object({
        name: z.string().trim().min(1).max(80),
        phone: z.string().trim().min(4).max(20).regex(/^[0-9+\-\s]+$/, 'Invalid phone'),
      })
      .optional(),
  })
  .refine((d) => d.method !== 'credit' || d.creditCustomer, {
    message: 'Customer name & phone are required for credit (udhaaro)',
    path: ['creditCustomer'],
  });

export const serviceCallSchema = z.object({
  table: z.string().trim().min(1).max(10),
  kind: z.enum(['waiter', 'bill']),
});

// Owner updates the in-café ordering lock. Accepts a partial patch: toggle
// enabled, replace the IP allowlist, or both. IPs are validated loosely (basic
// IPv4/IPv6/CIDR shape) — the server normalizes and dedupes on save.
const ipish = z
  .string()
  .trim()
  .max(64)
  .regex(/^([0-9a-fA-F:.]+)(\/\d{1,3})?$/, 'Invalid IP address or CIDR');
export const orderGateSchema = z
  .object({
    enabled: z.boolean().optional(),
    ips: z.array(ipish).max(20).optional(),
    // GPS geofence layer. lat/lng nullable so the owner can clear the pin.
    geo: z
      .object({
        enabled: z.boolean().optional(),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
        radiusM: z.number().min(20).max(5000).optional(),
      })
      .optional(),
    // How to combine the two layers when both are active.
    mode: z.enum(['any', 'all']).optional(),
  })
  .refine(
    (d) =>
      d.enabled !== undefined ||
      d.ips !== undefined ||
      d.geo !== undefined ||
      d.mode !== undefined,
    { message: 'Nothing to update' }
  );

export const creditRepaySchema = z.object({
  phone: z.string().trim().min(4).max(20),
  name: z.string().trim().min(1).max(80),
  amount: z.number().int().positive().max(1_000_000),
  method: z.enum(['cash', 'esewa', 'khalti', 'fonepay', 'card']),
  note: z.string().trim().max(200).default(''),
});

// Kitchen may only flip availability — nothing else on the item.
export const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_.-]+$/, 'Letters, numbers, _ . - only'),
  password: z.string().min(8).max(200),
  role: z.enum(['staff', 'kitchen', 'owner']),
  displayName: z.string().trim().min(1).max(80),
});

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  role: z.enum(['staff', 'kitchen', 'owner']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

// Express middleware factory: validates req.body, replaces it with parsed data.
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      return res.status(400).json({
        error: `${first.path.join('.') || 'body'}: ${first.message}`,
      });
    }
    req.body = result.data;
    next();
  };
}
