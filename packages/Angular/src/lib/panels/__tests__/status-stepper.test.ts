/**
 * Stage-reachability tests.
 *
 * `BuildOrderStages` encodes the lifecycle rules the DB triggers enforce. Getting
 * it wrong produces a UI that offers a move the server will refuse — or, worse,
 * hides one it would allow. Pure function, so the rules are checkable without
 * rendering anything.
 */
import { describe, expect, it } from 'vitest';
import {
    BuildOrderStages,
    MJOStageChangeRequestEventArgs,
    type MJOOrderStage,
} from '../order-stages';

const reachable = (current: MJOOrderStage, requiresFulfillment = false): MJOOrderStage[] =>
    BuildOrderStages(current, requiresFulfillment)
        .filter((s) => s.Reachable)
        .map((s) => s.Stage);

describe('BuildOrderStages', () => {
    it('lists the five stages in fixed order', () => {
        expect(BuildOrderStages('Draft').map((s) => s.Stage)).toEqual([
            'Draft',
            'Quoted',
            'Confirmed',
            'Posted',
            'Fulfilled',
        ]);
    });

    it('lets a Draft skip Quoted and go straight to Confirmed', () => {
        // Forward skipping is legal; the ORDER of stages is what is fixed.
        expect(reachable('Draft')).toEqual(['Quoted', 'Confirmed']);
    });

    it('lets a Quoted order confirm', () => {
        expect(reachable('Quoted')).toEqual(['Confirmed']);
    });

    it('never offers Posted as a manual move', () => {
        // Posted follows Confirmed near-instantly — it is an outcome, not a button.
        for (const stage of ['Draft', 'Quoted', 'Confirmed'] as MJOOrderStage[]) {
            expect(reachable(stage)).not.toContain('Posted');
        }
    });

    it('never offers Fulfilled as a manual move', () => {
        // It either auto-advances or comes from the fulfillment queue.
        expect(reachable('Posted', true)).not.toContain('Fulfilled');
        expect(reachable('Posted', false)).not.toContain('Fulfilled');
    });

    it('offers nothing once an order is Confirmed', () => {
        // After booking, corrections are reversing orders, not stage changes.
        expect(reachable('Confirmed')).toEqual([]);
        expect(reachable('Posted')).toEqual([]);
        expect(reachable('Fulfilled')).toEqual([]);
    });

    it('collapses a Voided order to a single terminal stage', () => {
        const stages = BuildOrderStages('Voided');
        expect(stages).toHaveLength(1);
        expect(stages[0].Stage).toBe('Voided');
        expect(stages[0].Reachable).toBe(false);
    });

    it('explains every blocked stage rather than leaving a dead end', () => {
        const blocked = BuildOrderStages('Draft').filter(
            (s) => !s.Reachable && s.Stage !== 'Draft' && s.Stage !== 'Quoted',
        );
        expect(blocked.length).toBeGreaterThan(0);
        for (const stage of blocked) {
            expect(stage.Note ?? '').not.toBe('');
        }
    });

    it('says WHY Fulfilled is blocked differently depending on the lines', () => {
        const ships = BuildOrderStages('Posted', true).find((s) => s.Stage === 'Fulfilled');
        const nothingShips = BuildOrderStages('Posted', false).find((s) => s.Stage === 'Fulfilled');
        expect(ships!.Note).toMatch(/must ship/i);
        expect(nothingShips!.Note).toMatch(/auto-advances/i);
    });

    it('warns that confirming is irreversible', () => {
        const confirm = BuildOrderStages('Draft').find((s) => s.Stage === 'Confirmed');
        expect(confirm!.Note).toMatch(/not undoable|exactly once/i);
    });
});

describe('MJOStageChangeRequestEventArgs', () => {
    it('starts un-cancelled and carries both stages', () => {
        const args = new MJOStageChangeRequestEventArgs('Draft', 'Confirmed');
        expect(args.Cancel).toBe(false);
        expect(args.From).toBe('Draft');
        expect(args.To).toBe('Confirmed');
    });

    it('can be cancelled with a reason', () => {
        const args = new MJOStageChangeRequestEventArgs('Draft', 'Confirmed');
        args.Cancel = true;
        args.CancelReason = 'pre-flight first';
        expect(args.Cancel).toBe(true);
        expect(args.CancelReason).toBe('pre-flight first');
    });
});
