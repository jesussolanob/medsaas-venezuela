import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/debug-booking — Diagnose why booking fails
// 🚫 Deshabilitado en producción.
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createAdminClient()
  const results: Record<string, unknown> = {}

  // 1. Check if patients table exists and its columns
  const { data: patientCols, error: patientColsErr } = await admin
    .from('patients')
    .select('*')
    .limit(0)

  results.patients_table = patientColsErr
    ? { error: patientColsErr.message }
    : { exists: true }

  // 2. Check if appointments table exists and its columns
  const { data: apptCols, error: apptColsErr } = await admin
    .from('appointments')
    .select('*')
    .limit(0)

  results.appointments_table = apptColsErr
    ? { error: apptColsErr.message }
    : { exists: true }

  // 3. Try creating a test patient
  const testDoctorId = '00000000-0000-0000-0000-000000000000' // fake

  // First, get a real doctor_id from profiles
  const { data: realDoctor } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'doctor')
    .eq('is_active', true)
    .limit(1)
    .single()

  results.real_doctor = realDoctor || 'No active doctor found'

  if (realDoctor) {
    // Try inserting a test patient
    const { data: testPatient, error: testPatientErr } = await admin
      .from('patients')
      .insert({
        doctor_id: realDoctor.id,
        full_name: 'TEST_DEBUG_PATIENT',
        email: 'debug_test@test.com',
        source: 'booking',
      })
      .select('id')
      .single()

    results.test_patient_insert = testPatientErr
      ? { error: testPatientErr.message, code: testPatientErr.code, details: testPatientErr.details }
      : { success: true, id: testPatient?.id }

    if (testPatient?.id) {
      // Verify patient exists
      const { data: verify, error: verifyErr } = await admin
        .from('patients')
        .select('id')
        .eq('id', testPatient.id)
        .single()

      results.test_patient_verify = verifyErr
        ? { error: verifyErr.message }
        : { exists: true, id: verify?.id }

      // Try inserting a test appointment
      const { data: testAppt, error: testApptErr } = await admin
        .from('appointments')
        .insert({
          doctor_id: realDoctor.id,
          patient_id: testPatient.id,
          patient_name: 'TEST_DEBUG_PATIENT',
          patient_email: 'debug_test@test.com',
          scheduled_at: new Date().toISOString(),
          status: 'scheduled',
          source: 'booking',
          plan_name: 'Test',
          plan_price: 0,
        })
        .select('id')
        .single()

      results.test_appointment_insert = testApptErr
        ? { error: testApptErr.message, code: testApptErr.code, details: testApptErr.details, hint: testApptErr.hint }
        : { success: true, id: testAppt?.id }

      // If appointment failed, try with appointment_date instead of scheduled_at
      if (testApptErr) {
        const { data: testAppt2, error: testApptErr2 } = await admin
          .from('appointments')
          .insert({
            doctor_id: realDoctor.id,
            patient_id: testPatient.id,
            patient_name: 'TEST_DEBUG_PATIENT',
            patient_email: 'debug_test@test.com',
            appointment_date: new Date().toISOString(),
            status: 'scheduled',
            source: 'booking',
            plan_name: 'Test',
            plan_price: 0,
          })
          .select('id')
          .single()

        results.test_appointment_with_appointment_date = testApptErr2
          ? { error: testApptErr2.message, code: testApptErr2.code }
          : { success: true, id: testAppt2?.id }

        // Clean up appointment if created
        if (testAppt2?.id) {
          await admin.from('appointments').delete().eq('id', testAppt2.id)
        }
      }

      // Clean up: delete test appointment and patient
      if (testAppt?.id) {
        await admin.from('appointments').delete().eq('id', testAppt.id)
      }
      await admin.from('patients').delete().eq('id', testPatient.id)
      results.cleanup = 'done'
    }
  }

  // 4. Check FK constraints using raw SQL via rpc (if available)
  // Try to see what the FK references
  const { data: fkInfo, error: fkErr } = await admin.rpc('get_fk_info', {}).maybeSingle()
  results.fk_rpc = fkErr ? 'rpc not available (expected)' : fkInfo

  return NextResponse.json(results, { status: 200 })
}
