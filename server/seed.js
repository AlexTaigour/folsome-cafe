import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { supabase, sb } from './db.js';

export async function runSeed() {
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  if (count > 0) return;

  const password = crypto.randomBytes(6).toString('base64url'); // ~8 chars
  sb(
    await supabase.from('users').insert({
      username: 'owner',
      password_hash: bcrypt.hashSync(password, 10),
      role: 'owner',
      display_name: 'Owner',
    })
  );

  console.log('='.repeat(56));
  console.log('  FIRST RUN — owner account created');
  console.log('  username: owner');
  console.log(`  password: ${password}`);
  console.log('  Write this down. Create staff/kitchen users from the');
  console.log('  Owner dashboard → Users tab, then change this password.');
  console.log('='.repeat(56));
}
