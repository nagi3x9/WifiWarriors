import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

// ユーザーが作成したFirebaseプロジェクトの設定
// （今回は認証（Auth）などは使わず、オープンなRealtime Databaseのみを想定しています）
const firebaseConfig = {
  // 本来はapiKeyなどフルセット必要ですが、
  // URLが指定されているテストモードのRealtime Databaseに対しては、これだけで最低限動きます。
  databaseURL: "https://wifi-warriors-b0713-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };
