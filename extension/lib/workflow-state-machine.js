/**
 * @file Extension Workflow State Machine (P57).
 *
 * Implements an explicit, typed state machine governing the candidate workflow
 * across job discovery, ATS fit analysis, project review, handoff preparation,
 * and multi-step application assistance.
 */

export const WORKFLOW_STATES = Object.freeze({
  IDLE: 'IDLE',
  DETECTING: 'DETECTING',
  JOB_DETECTED: 'JOB_DETECTED',
  JOB_CONFIRMED: 'JOB_CONFIRMED',
  ANALYZING: 'ANALYZING',
  ANALYSIS_READY: 'ANALYSIS_READY',
  APPLICATION_PREPARING: 'APPLICATION_PREPARING',
  APPLICATION_READY: 'APPLICATION_READY',
  IN_APPLICATION: 'IN_APPLICATION',
  FORM_DETECTED: 'FORM_DETECTED',
  FORM_MAPPING_READY: 'FORM_MAPPING_READY',
  READY_FOR_USER_REVIEW: 'READY_FOR_USER_REVIEW',
});

export const WORKFLOW_EVENTS = Object.freeze({
  START_DETECT: 'START_DETECT',
  JOB_FOUND: 'JOB_FOUND',
  NO_JOB_FOUND: 'NO_JOB_FOUND',
  CONFIRM_JOB: 'CONFIRM_JOB',
  START_ANALYSIS: 'START_ANALYSIS',
  ANALYSIS_SUCCESS: 'ANALYSIS_SUCCESS',
  ANALYSIS_FAIL: 'ANALYSIS_FAIL',
  START_PREPARE: 'START_PREPARE',
  PREPARE_SUCCESS: 'PREPARE_SUCCESS',
  PREPARE_FAIL: 'PREPARE_FAIL',
  ENTER_APPLICATION: 'ENTER_APPLICATION',
  FORM_FOUND: 'FORM_FOUND',
  FIELDS_MAPPED: 'FIELDS_MAPPED',
  REVIEW_COMPLETE: 'REVIEW_COMPLETE',
  LOCK_WORKFLOW: 'LOCK_WORKFLOW',
  UNLOCK_WORKFLOW: 'UNLOCK_WORKFLOW',
  RESET: 'RESET',
});

const VALID_TRANSITIONS = {
  [WORKFLOW_STATES.IDLE]: [
    WORKFLOW_EVENTS.START_DETECT,
    WORKFLOW_EVENTS.JOB_FOUND,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.DETECTING]: [
    WORKFLOW_EVENTS.JOB_FOUND,
    WORKFLOW_EVENTS.NO_JOB_FOUND,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.JOB_DETECTED]: [
    WORKFLOW_EVENTS.CONFIRM_JOB,
    WORKFLOW_EVENTS.START_ANALYSIS,
    WORKFLOW_EVENTS.START_DETECT,
    WORKFLOW_EVENTS.JOB_FOUND,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.JOB_CONFIRMED]: [
    WORKFLOW_EVENTS.START_ANALYSIS,
    WORKFLOW_EVENTS.START_DETECT,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.ANALYZING]: [
    WORKFLOW_EVENTS.ANALYSIS_SUCCESS,
    WORKFLOW_EVENTS.ANALYSIS_FAIL,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.ANALYSIS_READY]: [
    WORKFLOW_EVENTS.START_PREPARE,
    WORKFLOW_EVENTS.ENTER_APPLICATION,
    WORKFLOW_EVENTS.START_ANALYSIS,
    WORKFLOW_EVENTS.FORM_FOUND,
    WORKFLOW_EVENTS.JOB_FOUND,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.APPLICATION_PREPARING]: [
    WORKFLOW_EVENTS.PREPARE_SUCCESS,
    WORKFLOW_EVENTS.PREPARE_FAIL,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.APPLICATION_READY]: [
    WORKFLOW_EVENTS.ENTER_APPLICATION,
    WORKFLOW_EVENTS.FORM_FOUND,
    WORKFLOW_EVENTS.START_PREPARE,
    WORKFLOW_EVENTS.JOB_FOUND,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.IN_APPLICATION]: [
    WORKFLOW_EVENTS.FORM_FOUND,
    WORKFLOW_EVENTS.START_PREPARE,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.FORM_DETECTED]: [
    WORKFLOW_EVENTS.FIELDS_MAPPED,
    WORKFLOW_EVENTS.FORM_FOUND,
    WORKFLOW_EVENTS.START_PREPARE,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.FORM_MAPPING_READY]: [
    WORKFLOW_EVENTS.REVIEW_COMPLETE,
    WORKFLOW_EVENTS.FORM_FOUND,
    WORKFLOW_EVENTS.RESET,
  ],
  [WORKFLOW_STATES.READY_FOR_USER_REVIEW]: [
    WORKFLOW_EVENTS.FORM_FOUND,
    WORKFLOW_EVENTS.RESET,
  ],
};

export class WorkflowStateMachine {
  /**
   * @param {string} [initialState=WORKFLOW_STATES.IDLE]
   * @param {Function} [listener]
   */
  constructor(initialState = WORKFLOW_STATES.IDLE, listener = null) {
    this.currentState = initialState;
    this.listener = listener;
    this.history = [initialState];
    this.lockState = initialState === WORKFLOW_STATES.APPLICATION_READY ? 'LOCKED' : 'UNLOCKED';
  }

  get state() {
    return this.currentState;
  }

  set state(newState) {
    this.currentState = newState;
    if (newState === WORKFLOW_STATES.APPLICATION_READY) {
      this.lockState = 'LOCKED';
    } else if (newState === WORKFLOW_STATES.IDLE) {
      this.lockState = 'UNLOCKED';
    }
  }

  get isLocked() {
    return this.lockState === 'LOCKED';
  }

  lock() {
    this.lockState = 'LOCKED';
    return true;
  }

  unlock() {
    this.lockState = 'UNLOCKED';
    return true;
  }

  reset() {
    this.currentState = WORKFLOW_STATES.IDLE;
    this.lockState = 'UNLOCKED';
    this.history.push(WORKFLOW_STATES.IDLE);
    return true;
  }

  /**
   * Evaluates if a given event or target state is legal from the current state.
   */
  canTrigger(event) {
    if (event === WORKFLOW_EVENTS.RESET) return true;
    if (this.isLocked) {
      // While locked, detector/analysis events cannot mutate workflow; only reset or manual prepare allowed
      return event === WORKFLOW_EVENTS.UNLOCK_WORKFLOW || event === WORKFLOW_EVENTS.START_PREPARE;
    }
    if (event === WORKFLOW_EVENTS.LOCK_WORKFLOW) {
      return this.currentState === WORKFLOW_STATES.APPLICATION_READY;
    }
    if (event === WORKFLOW_EVENTS.UNLOCK_WORKFLOW) {
      return this.isLocked;
    }
    const allowed = VALID_TRANSITIONS[this.currentState] || [];
    return allowed.includes(event);
  }

  canTransition(targetOrEvent) {
    if (targetOrEvent in WORKFLOW_EVENTS) {
      return this.canTrigger(targetOrEvent);
    }

    if (targetOrEvent === this.currentState) return true;
    if (targetOrEvent === WORKFLOW_STATES.IDLE) return true;

    // Linear progression verification
    const order = [
      WORKFLOW_STATES.IDLE,
      WORKFLOW_STATES.DETECTING,
      WORKFLOW_STATES.JOB_DETECTED,
      WORKFLOW_STATES.JOB_CONFIRMED,
      WORKFLOW_STATES.ANALYZING,
      WORKFLOW_STATES.ANALYSIS_READY,
      WORKFLOW_STATES.APPLICATION_PREPARING,
      WORKFLOW_STATES.APPLICATION_READY,
      WORKFLOW_STATES.IN_APPLICATION,
      WORKFLOW_STATES.FORM_DETECTED,
      WORKFLOW_STATES.FORM_MAPPING_READY,
      WORKFLOW_STATES.READY_FOR_USER_REVIEW,
    ];

    const currentIdx = order.indexOf(this.currentState);
    const targetIdx = order.indexOf(targetOrEvent);

    if (currentIdx === -1 || targetIdx === -1) return false;

    // Direct step forward, self, or reasonable jump within phase
    return targetIdx >= currentIdx && targetIdx <= currentIdx + 2;
  }

  /**
   * Transitions state based on the dispatched event or direct target state.
   *
   * @param {string} eventOrState
   * @param {object} [context]
   * @returns {string|boolean}
   */
  transition(eventOrState, context = {}) {
    // If passed a direct target state
    if (eventOrState in WORKFLOW_STATES) {
      if (!this.canTransition(eventOrState)) {
        return false;
      }
      if (eventOrState === WORKFLOW_STATES.APPLICATION_READY) {
        this.lockState = 'LOCKED';
      } else if (eventOrState === WORKFLOW_STATES.IDLE) {
        this.lockState = 'UNLOCKED';
      }
      const previousState = this.currentState;
      this.currentState = eventOrState;
      this.history.push(eventOrState);
      if (typeof this.listener === 'function') {
        this.listener({ from: previousState, to: eventOrState, event: 'DIRECT_TRANSITION', context });
      }
      return true;
    }

    const event = eventOrState;
    if (!this.canTrigger(event)) {
      throw new Error(
        `Invalid workflow transition: cannot trigger "${event}" from state "${this.currentState}"`
      );
    }

    const previousState = this.currentState;
    let nextState = this.currentState;

    switch (event) {
      case WORKFLOW_EVENTS.START_DETECT:
        nextState = WORKFLOW_STATES.DETECTING;
        break;
      case WORKFLOW_EVENTS.JOB_FOUND:
        nextState = WORKFLOW_STATES.JOB_DETECTED;
        break;
      case WORKFLOW_EVENTS.NO_JOB_FOUND:
        nextState = WORKFLOW_STATES.IDLE;
        break;
      case WORKFLOW_EVENTS.CONFIRM_JOB:
        nextState = WORKFLOW_STATES.JOB_CONFIRMED;
        break;
      case WORKFLOW_EVENTS.START_ANALYSIS:
        nextState = WORKFLOW_STATES.ANALYZING;
        break;
      case WORKFLOW_EVENTS.ANALYSIS_SUCCESS:
        nextState = WORKFLOW_STATES.ANALYSIS_READY;
        break;
      case WORKFLOW_EVENTS.ANALYSIS_FAIL:
        nextState = WORKFLOW_STATES.JOB_CONFIRMED;
        break;
      case WORKFLOW_EVENTS.START_PREPARE:
        nextState = WORKFLOW_STATES.APPLICATION_PREPARING;
        break;
      case WORKFLOW_EVENTS.PREPARE_SUCCESS:
        nextState = WORKFLOW_STATES.APPLICATION_READY;
        this.lockState = 'LOCKED';
        break;
      case WORKFLOW_EVENTS.PREPARE_FAIL:
        nextState = WORKFLOW_STATES.ANALYSIS_READY;
        break;
      case WORKFLOW_EVENTS.LOCK_WORKFLOW:
        this.lockState = 'LOCKED';
        break;
      case WORKFLOW_EVENTS.UNLOCK_WORKFLOW:
        this.lockState = 'UNLOCKED';
        break;
      case WORKFLOW_EVENTS.ENTER_APPLICATION:
        nextState = WORKFLOW_STATES.IN_APPLICATION;
        break;
      case WORKFLOW_EVENTS.FORM_FOUND:
        nextState = WORKFLOW_STATES.FORM_DETECTED;
        break;
      case WORKFLOW_EVENTS.FIELDS_MAPPED:
        nextState = WORKFLOW_STATES.FORM_MAPPING_READY;
        break;
      case WORKFLOW_EVENTS.REVIEW_COMPLETE:
        nextState = WORKFLOW_STATES.READY_FOR_USER_REVIEW;
        break;
      case WORKFLOW_EVENTS.RESET:
        nextState = WORKFLOW_STATES.IDLE;
        this.lockState = 'UNLOCKED';
        break;
      default:
        nextState = this.currentState;
    }

    this.currentState = nextState;
    this.history.push(nextState);

    if (typeof this.listener === 'function') {
      this.listener({
        from: previousState,
        to: nextState,
        event,
        context,
      });
    }

    return nextState;
  }

  getState() {
    return this.currentState;
  }

  isAtLeast(targetState) {
    const order = [
      WORKFLOW_STATES.IDLE,
      WORKFLOW_STATES.DETECTING,
      WORKFLOW_STATES.JOB_DETECTED,
      WORKFLOW_STATES.JOB_CONFIRMED,
      WORKFLOW_STATES.ANALYZING,
      WORKFLOW_STATES.ANALYSIS_READY,
      WORKFLOW_STATES.APPLICATION_PREPARING,
      WORKFLOW_STATES.APPLICATION_READY,
      WORKFLOW_STATES.IN_APPLICATION,
      WORKFLOW_STATES.FORM_DETECTED,
      WORKFLOW_STATES.FORM_MAPPING_READY,
      WORKFLOW_STATES.READY_FOR_USER_REVIEW,
    ];
    return order.indexOf(this.currentState) >= order.indexOf(targetState);
  }
}
