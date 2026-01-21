import { supabase } from './supabaseClient';
import { User } from '../types';
import { DEFAULT_ADMIN, DEFAULT_USER } from '../constants';

// --- SUPABASE METHODS ---

export const getStoredUsers = async (): Promise<User[]> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) throw error;

    // Nếu database hoàn toàn trống (0 dòng), tự động thêm admin mặc định
    if (!data || data.length === 0) {
       console.log("Database empty, seeding defaults...");
       const defaults = [DEFAULT_ADMIN, DEFAULT_USER];
       const { error: insertError } = await supabase.from('users').insert(defaults);
       if (insertError) throw insertError;
       return defaults;
    }

    // LỌC BỎ CÁC USER ĐÃ BỊ "XÓA MỀM" (CÓ TÊN BẮT ĐẦU BẰNG __TRASH__)
    const activeUsers = (data as User[]).filter(u => !u.username.startsWith('__TRASH__'));

    return activeUsers;
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
};

export const findUserByCredential = async (input: string): Promise<User | null> => {
  try {
    // Tìm kiếm trong cả Email và Username
    // Sử dụng cú pháp .or của Supabase với double quotes để xử lý chuỗi an toàn hơn
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`email.ilike."${input}",username.eq."${input}"`)
      .maybeSingle();

    if (error) throw error;
    
    // Logic đảm bảo Admin mặc định luôn tồn tại nếu bị xóa nhầm
    // Kiểm tra dựa trên email hoặc username mặc định của admin
    if (!data) {
        if (input.toLowerCase() === DEFAULT_ADMIN.email.toLowerCase() || 
            input === DEFAULT_ADMIN.username) {
            console.log(`Admin '${DEFAULT_ADMIN.username}' missing. Restoring...`);
            const { error: upsertError } = await supabase
                .from('users')
                .upsert([DEFAULT_ADMIN]);
            
            if (!upsertError) return DEFAULT_ADMIN;
        }
    }

    return data as User | null;
  } catch (error) {
    console.error("Error finding user:", error);
    return null;
  }
};

export const createUser = async (username: string, email: string, secret: string): Promise<User> => {
  // Kiểm tra trùng lặp: Email phải duy nhất và Username cũng nên duy nhất để tránh nhập nhằng khi đăng nhập
  const { data: existingEmail } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (existingEmail) throw new Error("Email này đã tồn tại trong hệ thống");

  const { data: existingUser } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
  if (existingUser) throw new Error("Username (Tên đăng nhập) này đã tồn tại");

  const newUser: User = {
    id: crypto.randomUUID(),
    username,
    email,
    secret,
    isAdmin: false,
    createdAt: Date.now()
  };

  const { error } = await supabase.from('users').insert([newUser]);
  if (error) throw error;

  return newUser;
};

export const updateUserSecret = async (id: string, newSecret: string) => {
  // Cập nhật secret dựa trên ID
  const { data, error } = await supabase
    .from('users')
    .update({ secret: newSecret })
    .eq('id', id)
    .select(); 

  if (error) throw error;
};

export const deleteUser = async (id: string) => {
  // --- CHIẾN LƯỢC XÓA: Ưu tiên Xóa Vĩnh Viễn -> Fallback Xóa Mềm ---
  
  // 1. Thử xóa vĩnh viễn (Hard Delete) khỏi Database
  // Nếu RLS cho phép, bản ghi sẽ biến mất hoàn toàn.
  const { error: deleteError } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (!deleteError) {
    return; // Thành công! Đã xóa sạch.
  }

  // 2. Nếu xóa vĩnh viễn thất bại (VD: Lỗi Permission RLS), thực hiện Soft Delete (Đưa vào thùng rác)
  console.warn("Hard delete failed, falling back to Soft Delete (Trash)", deleteError);

  const { data: userToCheck, error: fetchError } = await supabase
    .from('users')
    .select('username')
    .eq('id', id)
    .single();

  if (fetchError || !userToCheck) {
    throw new Error("Không tìm thấy user để xóa");
  }

  // Tạo tên mới đánh dấu là rác: __TRASH__<timestamp>__<original_name>
  const trashName = `__TRASH__${Date.now()}__${userToCheck.username}`;

  const { error: updateError } = await supabase
    .from('users')
    .update({ username: trashName })
    .eq('id', id);

  if (updateError) {
    console.error("Supabase Trash Error:", updateError);
    // Nếu cả Hard Delete và Soft Delete đều lỗi
    throw new Error("Không thể xóa user (Cả vĩnh viễn lẫn thùng rác): " + updateError.message);
  }
};

export const importUsers = async (jsonString: string): Promise<boolean> => {
  try {
    const users: User[] = JSON.parse(jsonString);
    if (Array.isArray(users) && users.length > 0) {
      // Đảm bảo users import vào có trường email, nếu thiếu có thể sinh lỗi hoặc cần xử lý
      const { error } = await supabase.from('users').upsert(users);
      if (error) {
        console.error("Import error:", error);
        return false;
      }
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
};