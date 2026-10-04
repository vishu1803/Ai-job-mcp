/**
 * @file Phase 9.1 Regression Test — Unified Autofill Architecture (ARCH-060)
 *
 * Proves:
 * 1. Only one canonical autofill engine exists (CanonicalAutofillEngine === GenericAutofillEngine).
 * 2. MCP/Web plan generation uses canonical plan schema (FillPlanSchema).
 * 3. Extension consumes the same canonical plan (delegates to CanonicalAutofillEngine).
 * 4. Provider adapters do not implement duplicate fill operations.
 * 5. Generic fallback uses the same execution engine.
 * 6. Verification uses the same canonical verification contract.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CanonicalAutofillEngine,
  canonicalAutofillEngine,
} from '../../src/domain/portal/canonical-autofill-engine.js';
import {
  GenericAutofillEngine,
  genericAutofillEngine,
} from '../../src/domain/portal/generic-autofill-engine.js';
import {
  FillPlanSchema,
  AutofillExecutionResultSchema,
} from '../../src/domain/portal/autofill-engine.contract.js';
import { PortalFormSchema } from '../../src/domain/portal/portal-adapter.contract.js';
import { BasePortalAdapter } from '../../src/domain/portal/base-portal-adapter.js';
import {
  GreenhousePortalAdapter,
  LeverPortalAdapter,
  AshbyPortalAdapter,
  WorkdayPortalAdapter,
  SmartRecruitersPortalAdapter,
  IcimsPortalAdapter,
  GenericCareerSiteAdapter,
} from '../../src/domain/portal/adapters/index.js';
import { ExtensionAssistantService } from '../../src/services/extension-assistant.service.js';

describe('Phase 9.1 — Unified Autofill Architecture', () => {
  const canonicalCandidate = {
    id: 'cand-phase9-001',
    displayName: 'Alex Morgan',
    canonicalEmail: 'alex.morgan@example.com',
    contact: {
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex.morgan@example.com',
      phone: '+1 555 123 4567',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      country: 'USA',
    },
    socialLinks: {
      linkedin: 'https://linkedin.com/in/alexmorgan',
      github: 'https://github.com/alexmorgan',
      portfolio: 'https://alexmorgan.dev',
    },
    careerPreferences: {
      targetRoles: ['Staff Software Engineer'],
      remotePreference: 'REMOTE_ONLY',
      salaryFloor: 185000,
      salaryCurrency: 'USD',
      noticePeriod: '30_days',
      workAuthorization: ['US Citizen'],
      visaSponsorshipRequired: false,
    },
    profileMetadata: {
      careerPreferences: {
        salaryFloor: 185000,
        workAuthorization: ['US Citizen'],
        visaSponsorshipRequired: false,
      },
    },
  };

  const sampleFormSchema = {
    portalId: 'generic',
    formId: 'form-p9-1',
    destinationUrl: 'https://jobs.example.com/apply/123',
    fields: [
      {
        fieldId: 'fld_first_name',
        name: 'first_name',
        label: 'First Name',
        type: 'text',
        fieldType: 'FIRST_NAME',
        required: true,
      },
      {
        fieldId: 'fld_last_name',
        name: 'last_name',
        label: 'Last Name',
        type: 'text',
        fieldType: 'LAST_NAME',
        required: true,
      },
      {
        fieldId: 'fld_email',
        name: 'email',
        label: 'Email',
        type: 'email',
        fieldType: 'EMAIL',
        required: true,
      },
      {
        fieldId: 'fld_phone',
        name: 'phone',
        label: 'Phone Number',
        type: 'tel',
        fieldType: 'PHONE',
        required: false,
      },
      {
        fieldId: 'fld_work_auth',
        name: 'legal_work_auth',
        label: 'Are you authorized to work in the US?',
        type: 'text',
        fieldType: 'WORK_AUTHORIZATION',
        required: true,
      },
      {
        fieldId: 'fld_visa',
        name: 'visa_sponsorship',
        label: 'Do you require visa sponsorship?',
        type: 'text',
        fieldType: 'VISA_SPONSORSHIP',
        required: true,
      },
      {
        fieldId: 'fld_salary',
        name: 'salary_expectation',
        label: 'Minimum Salary Expectation',
        type: 'text',
        fieldType: 'SALARY_EXPECTATION',
        required: false,
      },
      {
        fieldId: 'fld_unsupported',
        name: 'security_clearance',
        label: 'Security Clearance Level',
        type: 'text',
        fieldType: 'CLEARANCE_LEVEL',
        required: false,
      },
      {
        fieldId: 'fld_legal_ack',
        name: 'declarations_accuracyconfirmed',
        label: 'I certify that all statements made are true and correct',
        type: 'checkbox',
        fieldType: 'ACCURACY_CERTIFICATION',
        required: true,
      },
    ],
  };

  const sampleApplicationPackage = {
    candidateId: canonicalCandidate.id,
    jobId: 'job-p9-1',
    applicationId: 'app-p9-1',
    destinationUrl: 'https://jobs.example.com/apply/123',
    candidate: canonicalCandidate,
    candidateProfile: canonicalCandidate,
    artifacts: {
      resume: { id: 'art-resume-1', filename: 'resume.pdf' },
      coverLetter: { id: 'art-cl-1', filename: 'cover-letter.pdf' },
    },
    answers: {},
  };

  // ---------------------------------------------------------------------------
  // 1. Only one canonical autofill engine exists
  // ---------------------------------------------------------------------------
  it('1. Only one canonical autofill engine exists: CanonicalAutofillEngine is the sole authority', () => {
    assert.strictEqual(
      CanonicalAutofillEngine,
      GenericAutofillEngine,
      'CanonicalAutofillEngine must be identical to GenericAutofillEngine'
    );
    assert.strictEqual(
      canonicalAutofillEngine,
      genericAutofillEngine,
      'canonicalAutofillEngine singleton must be identical to genericAutofillEngine singleton'
    );
    assert.ok(
      canonicalAutofillEngine instanceof CanonicalAutofillEngine,
      'canonicalAutofillEngine must be an instance of CanonicalAutofillEngine'
    );

    // Verify core lifecycle methods exist on the canonical engine
    assert.strictEqual(typeof canonicalAutofillEngine.planFill, 'function');
    assert.strictEqual(typeof canonicalAutofillEngine.planFillSync, 'function');
    assert.strictEqual(typeof canonicalAutofillEngine.executeFill, 'function');
    assert.strictEqual(typeof canonicalAutofillEngine.executeFillSync, 'function');
    assert.strictEqual(typeof canonicalAutofillEngine.verifyFill, 'function');
    assert.strictEqual(typeof canonicalAutofillEngine.verifyFillSync, 'function');
    assert.strictEqual(typeof canonicalAutofillEngine.validateFillPlan, 'function');
  });

  // ---------------------------------------------------------------------------
  // 2. MCP/Web plan generation uses canonical plan schema
  // ---------------------------------------------------------------------------
  it('2. MCP/Web plan generation uses canonical plan schema: planFill produces valid FillPlanSchema', async () => {
    const validatedForm = PortalFormSchema.parse(sampleFormSchema);
    const plan = await canonicalAutofillEngine.planFill(validatedForm, sampleApplicationPackage);

    // Strictly validate against canonical schema
    const parsedPlan = FillPlanSchema.parse(plan);
    assert.ok(parsedPlan.planId, 'Plan must have a planId');
    assert.strictEqual(parsedPlan.portalId, 'generic');
    assert.strictEqual(parsedPlan.actions.length, sampleFormSchema.fields.length);

    // Verify individual field planning logic
    const firstNameAction = parsedPlan.actions.find((a) => a.fieldId === 'fld_first_name');
    assert.ok(firstNameAction);
    assert.strictEqual(firstNameAction.action, 'FILL');
    assert.strictEqual(firstNameAction.sanitizedValue, 'Alex');
    assert.strictEqual(firstNameAction.provenance, 'VERIFIED_PROFILE');

    // Verify zero-fabrication: unevidenced field resolves strictly to REVIEW
    const unsupportedAction = parsedPlan.actions.find((a) => a.fieldId === 'fld_unsupported');
    assert.ok(unsupportedAction);
    assert.strictEqual(unsupportedAction.action, 'REVIEW');
    assert.strictEqual(unsupportedAction.rawValue, null);
    assert.strictEqual(unsupportedAction.requiresUserReview, true);

    // Verify protected legal declaration NEVER auto-fills
    const legalAction = parsedPlan.actions.find((a) => a.fieldId === 'fld_legal_ack');
    assert.ok(legalAction);
    assert.strictEqual(legalAction.action, 'REVIEW');
    assert.strictEqual(legalAction.isProtected, true);
    assert.strictEqual(legalAction.protectedCategory, 'accuracy_certification');
    assert.strictEqual(legalAction.requiresUserReview, true);
  });

  // ---------------------------------------------------------------------------
  // 3. Extension consumes the same canonical plan
  // ---------------------------------------------------------------------------
  it('3. Extension consumes the same canonical plan: ExtensionAssistantService delegates to CanonicalAutofillEngine', () => {
    const assistant = new ExtensionAssistantService();
    const detectedFormFields = sampleFormSchema.fields.map((f) => ({
      name: f.name,
      fieldType: f.fieldType,
      label: f.label,
    }));

    const extensionPlan = assistant.generateAutofillPlan({
      formFields: detectedFormFields,
      candidateProfile: canonicalCandidate,
    });

    assert.ok(extensionPlan.canonicalPlan, 'Extension plan must contain canonicalPlan');
    const validatedCanonical = FillPlanSchema.parse(extensionPlan.canonicalPlan);
    assert.strictEqual(validatedCanonical.actions.length, detectedFormFields.length);

    // Verify parity between canonical plan and extension mapped fields
    assert.strictEqual(extensionPlan.mappedFields.length, validatedCanonical.actions.length);

    for (let i = 0; i < detectedFormFields.length; i++) {
      const mapped = extensionPlan.mappedFields[i];
      const action = validatedCanonical.actions[i];

      assert.strictEqual(mapped.fieldName, action.name || action.fieldId);
      if (mapped.available) {
        assert.ok(action.rawValue !== null || action.sanitizedValue !== null);
      } else {
        assert.strictEqual(action.rawValue, null);
        assert.strictEqual(mapped.value, null);
      }
      assert.strictEqual(mapped.isSensitive, action.isProtected);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Provider adapters do not implement duplicate fill operations
  // ---------------------------------------------------------------------------
  it('4. Provider adapters do not implement duplicate fill operations: All 7 adapters delegate to canonical engine', () => {
    const adapters = [
      new GreenhousePortalAdapter(),
      new LeverPortalAdapter(),
      new AshbyPortalAdapter(),
      new WorkdayPortalAdapter(),
      new SmartRecruitersPortalAdapter(),
      new IcimsPortalAdapter(),
      new GenericCareerSiteAdapter(),
    ];

    for (const adapter of adapters) {
      assert.ok(
        adapter instanceof BasePortalAdapter,
        `${adapter.name} must inherit from BasePortalAdapter`
      );
      assert.strictEqual(
        adapter.autofillEngine,
        canonicalAutofillEngine,
        `${adapter.name} must use canonicalAutofillEngine`
      );

      // Verify adapter does not override executeFill or verifyFill with custom DOM loops
      assert.strictEqual(
        adapter.executeAutofill,
        BasePortalAdapter.prototype.executeAutofill,
        `${adapter.name} must inherit BasePortalAdapter.prototype.executeAutofill without duplication`
      );
      assert.strictEqual(
        adapter.prepareAutofill,
        BasePortalAdapter.prototype.prepareAutofill,
        `${adapter.name} must inherit BasePortalAdapter.prototype.prepareAutofill without duplication`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Generic fallback uses the same execution engine
  // ---------------------------------------------------------------------------
  it('5. Generic fallback uses the same execution engine: GenericCareerSiteAdapter uses canonical engine', async () => {
    const genericAdapter = new GenericCareerSiteAdapter();
    assert.strictEqual(genericAdapter.autofillEngine, canonicalAutofillEngine);

    const validatedForm = PortalFormSchema.parse(sampleFormSchema);
    const mockContext = {
      doc: {
        querySelectorAll: () => [],
        querySelector: () => null,
      },
    };

    // Spy on extractFormSchema
    genericAdapter.extractFormSchema = async () => validatedForm;

    const { formSchema, fillPlan } = await genericAdapter.prepareAutofill(
      mockContext,
      sampleApplicationPackage
    );

    assert.ok(formSchema);
    assert.ok(fillPlan);
    const parsed = FillPlanSchema.parse(fillPlan);
    assert.strictEqual(parsed.portalId, 'generic');
    assert.strictEqual(parsed.actions.length, sampleFormSchema.fields.length);
  });

  // ---------------------------------------------------------------------------
  // 6. Verification uses the same canonical verification contract
  // ---------------------------------------------------------------------------
  it('6. Verification uses the same canonical verification contract: verifyFill returns canonical verification telemetry', async () => {
    const fillPlan = {
      planId: 'plan-verify-001',
      portalId: 'generic',
      formId: 'form-verify-001',
      actions: [
        {
          fieldId: 'fld_name',
          name: 'first_name',
          label: 'First Name',
          action: 'FILL',
          status: 'PLANNED',
          rawValue: 'Alex',
          sanitizedValue: 'Alex',
          source: 'candidate.firstName',
          confidence: 'HIGH',
          requiresUserReview: false,
          isProtected: false,
          verificationMethod: 'DOM_VALUE',
        },
      ],
    };

    // 1. Success verification test (DOM matches planned value)
    const matchingDoc = {
      querySelector: (selector) => {
        if (selector.includes('fld_name') || selector.includes('first_name')) {
          return { id: 'fld_name', name: 'first_name', value: 'Alex' };
        }
        return null;
      },
    };

    const successVerification = await canonicalAutofillEngine.verifyFill(fillPlan, {
      doc: matchingDoc,
    });
    assert.strictEqual(successVerification.verified, true);
    assert.strictEqual(successVerification.verifiedCount, 1);
    assert.strictEqual(successVerification.mismatches.length, 0);

    // 2. Mismatch verification test (DOM value does not match planned value)
    const mismatchDoc = {
      querySelector: (selector) => {
        if (selector.includes('fld_name') || selector.includes('first_name')) {
          return { id: 'fld_name', name: 'first_name', value: 'CorruptedValue' };
        }
        return null;
      },
    };

    const failureVerification = await canonicalAutofillEngine.verifyFill(fillPlan, {
      doc: mismatchDoc,
    });
    assert.strictEqual(failureVerification.verified, false);
    assert.strictEqual(failureVerification.verifiedCount, 0);
    assert.strictEqual(failureVerification.mismatches.length, 1);
    assert.strictEqual(failureVerification.mismatches[0].fieldId, 'fld_name');
    assert.strictEqual(failureVerification.mismatches[0].expected, 'Alex');
    assert.strictEqual(failureVerification.mismatches[0].actual, 'CorruptedValue');
    assert.strictEqual(failureVerification.mismatches[0].reason, 'VALUE_MISMATCH');

    // 3. BasePortalAdapter executeAutofill returns canonical verification result
    const genericAdapter = new GenericCareerSiteAdapter();
    const adapterResult = await genericAdapter.executeAutofill(fillPlan, { doc: matchingDoc });
    assert.ok(adapterResult.executionResult);
    assert.ok(adapterResult.verificationResult);
    assert.strictEqual(adapterResult.verificationResult.verified, true);
  });
});
