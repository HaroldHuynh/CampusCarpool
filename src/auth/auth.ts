import { getSupabaseClient } from '../lib/supabase'

const CAL_POLY_EMAIL_DOMAIN = '@calpoly.edu'

export type AccountStatus = 'pending' | 'approved' | 'denied'

export type ContactMethod = 'phone' | 'instagram'

export type SignUpDetails = {
  email: string
  password: string
  firstName: string
  lastName: string
  contactMethod: ContactMethod
  contactValue: string
}

/** One row of public.access_requests — the project's approval record. */
export type AccessRequest = {
  user_id: string
  email: string
  full_name: string | null
  status: AccountStatus
  first_name: string | null
  last_name: string | null
  contact_method: ContactMethod | null
  contact_value: string | null
}

/** A row is incomplete if it predates the name/contact columns. */
export function isProfileIncomplete(row: AccessRequest | null) {
  return !row || !row.first_name || !row.last_name || !row.contact_value
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

export function isCalPolyEmail(email: string) {
  return normalizeEmail(email).endsWith(CAL_POLY_EMAIL_DOMAIN)
}

function assertCalPolyEmail(email: string) {
  if (!isCalPolyEmail(email)) {
    throw new Error('Use your Cal Poly email address.')
  }
}

/**
 * Progressive display formatting for the phone input: (805) 555-0134.
 * A leading + switches to international mode and is left ungrouped, since
 * parenthesised area codes only make sense for NANP numbers.
 */
export function formatPhoneInput(value: string) {
  const digits = value.replace(/[^\d]/g, '')

  if (value.trim().startsWith('+')) {
    return `+${digits}`
  }

  // Past 10 digits this is not a NANP number, so group nothing rather than
  // formatting the first 10 and silently dropping the rest.
  if (digits.length > 10) {
    return digits
  }

  if (digits.length === 0) {
    return ''
  }

  // The opening paren appears with the first digit so the field never
  // reflows mid-typing.
  if (digits.length <= 3) {
    return `(${digits}`
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

/** Digits only, 10-15 — loose enough for +1 and international forms. */
export function normalizePhone(value: string) {
  const digits = value.replace(/[^\d]/g, '')

  if (digits.length < 10 || digits.length > 15) {
    throw new Error('Enter a phone number with 10 to 15 digits.')
  }

  return digits.length === 10 ? `+1${digits}` : `+${digits}`
}

/** Strips a leading @ and validates against Instagram's handle rules. */
export function normalizeInstagram(value: string) {
  const handle = value.trim().replace(/^@+/, '').toLowerCase()

  if (!/^[a-z0-9._]{1,30}$/.test(handle)) {
    throw new Error('Instagram handles use letters, numbers, periods, and underscores.')
  }

  return `@${handle}`
}

export function normalizeContact(method: ContactMethod, value: string) {
  return method === 'phone' ? normalizePhone(value) : normalizeInstagram(value)
}

export async function signUpWithPassword(details: SignUpDetails) {
  const normalizedEmail = normalizeEmail(details.email)
  assertCalPolyEmail(normalizedEmail)

  const firstName = details.firstName.trim()
  const lastName = details.lastName.trim()

  if (!firstName || !lastName) {
    throw new Error('Enter both your first and last name.')
  }

  const contactValue = normalizeContact(details.contactMethod, details.contactValue)

  const { data, error } = await getSupabaseClient().auth.signUp({
    email: normalizedEmail,
    password: details.password,
    options: {
      data: {
        // create_access_request_for_new_user() copies all of these into
        // access_requests.
        full_name: `${firstName} ${lastName}`,
        first_name: firstName,
        last_name: lastName,
        contact_method: details.contactMethod,
        contact_value: contactValue,
      },
    },
  })

  if (error) {
    throw error
  }

  return { email: normalizedEmail, alreadyRegistered: isExistingUserSignUp(data.user) }
}

/**
 * Confirms a new account with the 6-digit code Supabase emails on signup.
 * Type is 'signup' here — 'email' is for magic-link / passwordless sign-in and
 * will not confirm a pending registration.
 */
export async function verifySignUpCode(email: string, token: string) {
  const normalizedEmail = normalizeEmail(email)
  assertCalPolyEmail(normalizedEmail)

  const { data, error } = await getSupabaseClient().auth.verifyOtp({
    email: normalizedEmail,
    token: token.replace(/\s/g, ''),
    type: 'signup',
  })

  if (error) {
    throw error
  }

  return data.user
}

/** Re-sends the signup confirmation code. */
export async function resendSignUpCode(email: string) {
  const normalizedEmail = normalizeEmail(email)

  const { error } = await getSupabaseClient().auth.resend({
    type: 'signup',
    email: normalizedEmail,
  })

  if (error) {
    throw error
  }
}

/**
 * Passwordless entry: emails a 6-digit code, creating the account on first use.
 * Supabase picks the template by whether the user exists — "Confirm signup"
 * for new addresses, "Magic Link" for returning ones — so both must carry
 * {{ .Token }}.
 */
export async function sendEmailCode(email: string) {
  const normalizedEmail = normalizeEmail(email)
  assertCalPolyEmail(normalizedEmail)

  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email: normalizedEmail,
    options: { shouldCreateUser: true },
  })

  if (error) {
    throw error
  }

  return normalizedEmail
}

/** Verifies the emailed code and returns the signed-in user. */
export async function verifyEmailCode(email: string, token: string) {
  const normalizedEmail = normalizeEmail(email)
  assertCalPolyEmail(normalizedEmail)

  const { data, error } = await getSupabaseClient().auth.verifyOtp({
    email: normalizedEmail,
    token: token.replace(/\s/g, ''),
    type: 'email',
  })

  if (error) {
    throw error
  }

  return data.user
}

/**
 * Supabase does not report "already registered" on signUp — to avoid leaking
 * which addresses exist it returns a success shaped like a new user, but with
 * an empty identities array. That is the only signal, so it is what we check.
 */
export function isExistingUserSignUp(user: { identities?: unknown[] | null } | null) {
  return Boolean(user && Array.isArray(user.identities) && user.identities.length === 0)
}

/** Emails a code to an address that already exists, without creating one. */
export async function sendClaimCode(email: string) {
  const normalizedEmail = normalizeEmail(email)
  assertCalPolyEmail(normalizedEmail)

  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email: normalizedEmail,
    options: { shouldCreateUser: false },
  })

  if (error) {
    throw error
  }
}

/** Sets a password on the signed-in account. */
export async function setPassword(password: string) {
  const { error } = await getSupabaseClient().auth.updateUser({ password })

  if (error) {
    throw error
  }
}

/**
 * Fills in the profile columns on the caller's own access_requests row via a
 * SECURITY DEFINER function, so `status` stays out of reach.
 */
export async function saveProfile(details: {
  firstName: string
  lastName: string
  contactMethod: ContactMethod
  contactValue: string
}) {
  const firstName = details.firstName.trim()
  const lastName = details.lastName.trim()

  if (!firstName || !lastName) {
    throw new Error('Enter both your first and last name.')
  }

  const contactValue = normalizeContact(details.contactMethod, details.contactValue)

  const supabase = getSupabaseClient()

  const { error } = await supabase.rpc('update_my_profile', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_contact_method: details.contactMethod,
    p_contact_value: contactValue,
  })

  if (error) {
    throw error
  }

  // campus_profiles carries the name shown on ride cards, so it has to move
  // with the access_requests row or the two drift apart.
  const { data: userData } = await supabase.auth.getUser()

  if (userData.user) {
    await supabase
      .from('campus_profiles')
      .update({ display_name: `${firstName} ${lastName}`.slice(0, 50) })
      .eq('user_id', userData.user.id)
  }
}

export async function signInWithPassword(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email)
  assertCalPolyEmail(normalizedEmail)

  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email: normalizedEmail,
    password,
  })

  if (error) {
    throw error
  }

  return data.user
}

/**
 * RLS on access_requests limits the caller to their own row, so no filter is
 * needed here — and other members' rows are deliberately unreadable.
 */
export async function getAccessRequest(): Promise<AccessRequest | null> {
  const { data, error } = await getSupabaseClient()
    .from('access_requests')
    .select('user_id, email, full_name, status, first_name, last_name, contact_method, contact_value')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function getCurrentUser() {
  const { data: sessionData, error: sessionError } = await getSupabaseClient().auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  if (!sessionData.session) {
    return null
  }

  const { data, error } = await getSupabaseClient().auth.getUser()

  if (error) {
    throw error
  }

  return data.user
}

export async function signOut() {
  const { error } = await getSupabaseClient().auth.signOut()

  if (error) {
    throw error
  }
}
