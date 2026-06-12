import { User } from '../types';

const USERS_KEY = 'fluento_users_v1';
const SESSION_KEY = 'fluento_session_v1';

// Helper to get users from localStorage
const getUsers = (): Record<string, { fullName: string; passwordHash: string }> => {
  try {
    const users = localStorage.getItem(USERS_KEY);
    if (!users) return {};
    return JSON.parse(users);
  } catch (error) {
    console.error("Error parsing users from localStorage", error);
    return {};
  }
};

// Helper to save users to localStorage
const saveUsers = (users: Record<string, any>): void => {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (error) {
    console.error("Error saving users to localStorage", error);
  }
};

/**
 * Signs up a new user.
 * @returns The user object on success, or throws an error.
 */
export const signUp = (fullName: string, email: string, password: string): User => {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedPassword = password.trim();

  if (!normalizedEmail || !trimmedPassword || !fullName.trim()) {
    throw new Error('Please fill in all fields.');
  }

  if (users[normalizedEmail]) {
    throw new Error('An account with this email already exists.');
  }
  
  if (trimmedPassword.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  // In a real app, you would hash the password. We'll store it directly for this prototype.
  users[normalizedEmail] = { fullName: fullName.trim(), passwordHash: trimmedPassword };
  saveUsers(users);

  const newUser: User = { fullName: fullName.trim(), email: normalizedEmail };
  // Automatically sign in the user after registration
  localStorage.setItem(SESSION_KEY, JSON.stringify(newUser));
  return newUser;
};

/**
 * Signs in an existing user.
 * @returns The user object on success, or throws an error.
 */
export const signIn = (email: string, password: string): User => {
  const users = getUsers();
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedPassword = password.trim();

  if (!normalizedEmail || !trimmedPassword) {
    throw new Error('Please enter both email and password.');
  }

  const userData = users[normalizedEmail];

  if (!userData) {
    throw new Error('No account found with this email. Please sign up first.');
  }

  if (userData.passwordHash !== trimmedPassword) {
    throw new Error('Incorrect password. Please try again.');
  }

  const user: User = { fullName: userData.fullName, email: normalizedEmail };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch (error) {
    console.error("Failed to save session", error);
  }
  return user;
};

/**
 * Signs out the current user.
 */
export const signOut = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

/**
 * Gets the currently logged-in user from the session.
 * @returns The user object if logged in, otherwise null.
 */
export const getCurrentUser = (): User | null => {
  try {
    const session = localStorage.getItem(SESSION_KEY);
    if (!session) return null;
    const user = JSON.parse(session);
    // Basic validation to ensure the object is a User
    if (user && typeof user === 'object' && 'email' in user && 'fullName' in user) {
      return user as User;
    }
    return null;
  } catch (error) {
    console.error("Error parsing session from localStorage", error);
    return null;
  }
};
