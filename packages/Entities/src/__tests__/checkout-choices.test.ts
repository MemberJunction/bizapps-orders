import { describe, expect, it } from 'vitest';
import {
    CheckChoicesAgainstGroups,
    CheckCheckoutChoices,
    ChoicesForStorage,
    DescribeChoiceCount,
    INVALID_CHECKOUT_CHOICE_GROUPS_MESSAGE,
    ReadCheckoutChoiceGroups,
    type CheckoutChoiceGroup,
} from '../checkout-choices.js';

const DEPARTMENTS: CheckoutChoiceGroup = {
    key: 'department',
    label: 'Choose your departments',
    options: [{ value: 'marketing', label: 'Marketing' }, { value: 'membership', label: 'Membership' }, 'Finance'],
    min: 2,
    max: 2,
};
const EXTRAS: CheckoutChoiceGroup = { key: 'extras', label: 'Add-ons', options: ['A', 'B', 'C'], min: 0, max: 2 };

describe('ReadCheckoutChoiceGroups', () => {
    it('reads no groups when the widget offers none', () => {
        expect(ReadCheckoutChoiceGroups(undefined)).toEqual({ Groups: [] });
        expect(ReadCheckoutChoiceGroups(null)).toEqual({ Groups: [] });
    });

    it('accepts a well-formed list', () => {
        expect(ReadCheckoutChoiceGroups([DEPARTMENTS, EXTRAS])).toEqual({ Groups: [DEPARTMENTS, EXTRAS] });
    });

    it.each([
        ['not a list', { key: 'x' }],
        ['a group with no options', [{ ...DEPARTMENTS, options: [] }]],
        ['a repeated key', [DEPARTMENTS, DEPARTMENTS]],
        ['a repeated option value', [{ ...DEPARTMENTS, options: ['A', 'A', 'B'] }]],
        ['min above max', [{ ...DEPARTMENTS, min: 3, max: 2 }]],
        ['max above the number of options', [{ ...DEPARTMENTS, min: 1, max: 4 }]],
        ['max of zero', [{ ...EXTRAS, max: 0 }]],
        ['a fractional count', [{ ...EXTRAS, max: 1.5 }]],
        ['a key longer than the column', [{ ...DEPARTMENTS, key: 'k'.repeat(101) }]],
        ['an option value longer than the column', [{ ...EXTRAS, options: ['v'.repeat(101), 'B'] }]],
        ['a blank label', [{ ...DEPARTMENTS, label: ' ' }]],
    ])('refuses %s', (_name, raw) => {
        expect(ReadCheckoutChoiceGroups(raw)).toEqual({ Groups: [], Error: INVALID_CHECKOUT_CHOICE_GROUPS_MESSAGE });
    });
});

describe('DescribeChoiceCount', () => {
    it('words the count for the buyer', () => {
        expect(DescribeChoiceCount(DEPARTMENTS)).toBe('exactly 2');
        expect(DescribeChoiceCount(EXTRAS)).toBe('up to 2');
        expect(DescribeChoiceCount({ ...EXTRAS, min: 1, max: 3 })).toBe('1 to 3');
    });
});

describe('CheckChoicesAgainstGroups', () => {
    it('resolves the picks in option order with their labels', () => {
        expect(CheckChoicesAgainstGroups([DEPARTMENTS], { department: ['Finance', 'marketing'] })).toEqual({
            Choices: [
                { GroupKey: 'department', GroupLabel: 'Choose your departments', OptionValue: 'marketing', OptionLabel: 'Marketing' },
                { GroupKey: 'department', GroupLabel: 'Choose your departments', OptionValue: 'Finance', OptionLabel: 'Finance' },
            ],
        });
    });

    it('counts a repeated option once', () => {
        const res = CheckChoicesAgainstGroups([DEPARTMENTS], { department: ['marketing', 'marketing', 'Finance'] });
        expect(res.Error).toBeUndefined();
        expect(res.Choices.map((c) => c.OptionValue)).toEqual(['marketing', 'Finance']);
    });

    it('refuses fewer than the minimum, unless partial', () => {
        expect(CheckChoicesAgainstGroups([DEPARTMENTS], { department: ['marketing'] }).Error).toBe(
            'Please choose exactly 2 for "Choose your departments".'
        );
        expect(CheckChoicesAgainstGroups([DEPARTMENTS], undefined).Error).toBe('Please choose exactly 2 for "Choose your departments".');
        expect(CheckChoicesAgainstGroups([DEPARTMENTS], { department: ['marketing'] }, { partial: true }).Error).toBeUndefined();
    });

    it('refuses more than the maximum, even when partial', () => {
        const three = { department: ['marketing', 'membership', 'Finance'] };
        expect(CheckChoicesAgainstGroups([DEPARTMENTS], three).Error).toBe('Please choose exactly 2 for "Choose your departments".');
        expect(CheckChoicesAgainstGroups([DEPARTMENTS], three, { partial: true }).Error).toBeDefined();
    });

    it('accepts no picks from an optional group', () => {
        expect(CheckChoicesAgainstGroups([EXTRAS], {})).toEqual({ Choices: [] });
    });

    it('refuses an option the group does not offer', () => {
        expect(CheckChoicesAgainstGroups([DEPARTMENTS], { department: ['marketing', 'legal'] }).Error).toBe(
            '"legal" is not one of the options for "Choose your departments".'
        );
    });

    it('refuses a group the widget does not offer', () => {
        expect(CheckChoicesAgainstGroups([DEPARTMENTS], { forged: ['x'] }).Error).toBe(
            'A choice was sent for a group this checkout does not offer.'
        );
    });

    it.each([
        ['a list instead of an object', ['marketing']],
        ['a string instead of a list', { department: 'marketing' }],
        ['a non-string pick', { department: [1, 2] }],
    ])('refuses %s', (_name, picks) => {
        expect(CheckChoicesAgainstGroups([DEPARTMENTS], picks).Error).toBeDefined();
    });
});

describe('CheckCheckoutChoices', () => {
    it('refuses when the groups are malformed', () => {
        expect(CheckCheckoutChoices('nope', {})).toEqual({ Choices: [], Error: INVALID_CHECKOUT_CHOICE_GROUPS_MESSAGE });
    });

    it('checks the picks against well-formed groups', () => {
        expect(CheckCheckoutChoices([EXTRAS], { extras: ['B'] }).Choices).toHaveLength(1);
    });
});

describe('ChoicesForStorage', () => {
    it('keys the option values by group', () => {
        const { Choices } = CheckChoicesAgainstGroups([DEPARTMENTS, EXTRAS], { department: ['marketing', 'Finance'], extras: ['C'] });
        expect(ChoicesForStorage(Choices)).toEqual({ department: ['marketing', 'Finance'], extras: ['C'] });
    });
});
