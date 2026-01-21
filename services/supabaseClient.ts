import { createClient } from '@supabase/supabase-js';

// --- CẤU HÌNH DATABASE ---
// Bạn cần tạo project tại https://supabase.com
// Sau đó vào Project Settings -> API để lấy URL và ANON KEY
// Thay thế 2 dòng dưới đây bằng thông tin của bạn:

const SUPABASE_URL = 'https://jowozojgasrlvblybskq.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_j8uHEzfCVStjFs3ko9LY_w_N1Ifha7b';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
