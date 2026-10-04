/**
 * Billing location — the facts a sale needs to be placed in a taxing jurisdiction.
 *
 * A card sale taken with no location can never be assigned to a state or country afterwards, so
 * the self-serve checkout refuses to take payment without one. Country is ISO 3166-1 alpha-2;
 * the region is the ISO 3166-2 subdivision code WITHOUT its country prefix (`IL`, not `US-IL`),
 * because that is the form `TaxJurisdiction.RegionCode` holds and jurisdiction matching compares
 * the two directly.
 *
 * The lists live here, beside the entities, so the widget's pickers and the server's check read
 * the same data and cannot disagree about what a valid location is.
 *
 * @module @mj-biz-apps/orders-entities/billing-location
 */

/** A country or subdivision as a picker shows it. */
export interface LocationOption {
    Code: string;
    Name: string;
}

/** A location that passed {@link CheckBillingLocation}, normalised to upper-case codes. */
export interface BillingLocation {
    Country: string;
    StateProvince: string | null;
    PostalCode: string | null;
}

export type BillingLocationCheck =
    | { Valid: true; Location: BillingLocation }
    | { Valid: false; Reason: string };

/** ISO 3166-1 alpha-2, by English short name. */
export const BILLING_COUNTRIES: ReadonlyArray<LocationOption> = [
    { Code: 'AF', Name: 'Afghanistan' },
    { Code: 'AX', Name: 'Åland Islands' },
    { Code: 'AL', Name: 'Albania' },
    { Code: 'DZ', Name: 'Algeria' },
    { Code: 'AS', Name: 'American Samoa' },
    { Code: 'AD', Name: 'Andorra' },
    { Code: 'AO', Name: 'Angola' },
    { Code: 'AI', Name: 'Anguilla' },
    { Code: 'AQ', Name: 'Antarctica' },
    { Code: 'AG', Name: 'Antigua and Barbuda' },
    { Code: 'AR', Name: 'Argentina' },
    { Code: 'AM', Name: 'Armenia' },
    { Code: 'AW', Name: 'Aruba' },
    { Code: 'AU', Name: 'Australia' },
    { Code: 'AT', Name: 'Austria' },
    { Code: 'AZ', Name: 'Azerbaijan' },
    { Code: 'BS', Name: 'Bahamas' },
    { Code: 'BH', Name: 'Bahrain' },
    { Code: 'BD', Name: 'Bangladesh' },
    { Code: 'BB', Name: 'Barbados' },
    { Code: 'BY', Name: 'Belarus' },
    { Code: 'BE', Name: 'Belgium' },
    { Code: 'BZ', Name: 'Belize' },
    { Code: 'BJ', Name: 'Benin' },
    { Code: 'BM', Name: 'Bermuda' },
    { Code: 'BT', Name: 'Bhutan' },
    { Code: 'BO', Name: 'Bolivia' },
    { Code: 'BQ', Name: 'Bonaire, Sint Eustatius and Saba' },
    { Code: 'BA', Name: 'Bosnia and Herzegovina' },
    { Code: 'BW', Name: 'Botswana' },
    { Code: 'BV', Name: 'Bouvet Island' },
    { Code: 'BR', Name: 'Brazil' },
    { Code: 'IO', Name: 'British Indian Ocean Territory' },
    { Code: 'BN', Name: 'Brunei Darussalam' },
    { Code: 'BG', Name: 'Bulgaria' },
    { Code: 'BF', Name: 'Burkina Faso' },
    { Code: 'BI', Name: 'Burundi' },
    { Code: 'CV', Name: 'Cabo Verde' },
    { Code: 'KH', Name: 'Cambodia' },
    { Code: 'CM', Name: 'Cameroon' },
    { Code: 'CA', Name: 'Canada' },
    { Code: 'KY', Name: 'Cayman Islands' },
    { Code: 'CF', Name: 'Central African Republic' },
    { Code: 'TD', Name: 'Chad' },
    { Code: 'CL', Name: 'Chile' },
    { Code: 'CN', Name: 'China' },
    { Code: 'CX', Name: 'Christmas Island' },
    { Code: 'CC', Name: 'Cocos (Keeling) Islands' },
    { Code: 'CO', Name: 'Colombia' },
    { Code: 'KM', Name: 'Comoros' },
    { Code: 'CG', Name: 'Congo' },
    { Code: 'CD', Name: 'Congo, Democratic Republic of the' },
    { Code: 'CK', Name: 'Cook Islands' },
    { Code: 'CR', Name: 'Costa Rica' },
    { Code: 'CI', Name: "Côte d'Ivoire" },
    { Code: 'HR', Name: 'Croatia' },
    { Code: 'CU', Name: 'Cuba' },
    { Code: 'CW', Name: 'Curaçao' },
    { Code: 'CY', Name: 'Cyprus' },
    { Code: 'CZ', Name: 'Czechia' },
    { Code: 'DK', Name: 'Denmark' },
    { Code: 'DJ', Name: 'Djibouti' },
    { Code: 'DM', Name: 'Dominica' },
    { Code: 'DO', Name: 'Dominican Republic' },
    { Code: 'EC', Name: 'Ecuador' },
    { Code: 'EG', Name: 'Egypt' },
    { Code: 'SV', Name: 'El Salvador' },
    { Code: 'GQ', Name: 'Equatorial Guinea' },
    { Code: 'ER', Name: 'Eritrea' },
    { Code: 'EE', Name: 'Estonia' },
    { Code: 'SZ', Name: 'Eswatini' },
    { Code: 'ET', Name: 'Ethiopia' },
    { Code: 'FK', Name: 'Falkland Islands (Malvinas)' },
    { Code: 'FO', Name: 'Faroe Islands' },
    { Code: 'FJ', Name: 'Fiji' },
    { Code: 'FI', Name: 'Finland' },
    { Code: 'FR', Name: 'France' },
    { Code: 'GF', Name: 'French Guiana' },
    { Code: 'PF', Name: 'French Polynesia' },
    { Code: 'TF', Name: 'French Southern Territories' },
    { Code: 'GA', Name: 'Gabon' },
    { Code: 'GM', Name: 'Gambia' },
    { Code: 'GE', Name: 'Georgia' },
    { Code: 'DE', Name: 'Germany' },
    { Code: 'GH', Name: 'Ghana' },
    { Code: 'GI', Name: 'Gibraltar' },
    { Code: 'GR', Name: 'Greece' },
    { Code: 'GL', Name: 'Greenland' },
    { Code: 'GD', Name: 'Grenada' },
    { Code: 'GP', Name: 'Guadeloupe' },
    { Code: 'GU', Name: 'Guam' },
    { Code: 'GT', Name: 'Guatemala' },
    { Code: 'GG', Name: 'Guernsey' },
    { Code: 'GN', Name: 'Guinea' },
    { Code: 'GW', Name: 'Guinea-Bissau' },
    { Code: 'GY', Name: 'Guyana' },
    { Code: 'HT', Name: 'Haiti' },
    { Code: 'HM', Name: 'Heard Island and McDonald Islands' },
    { Code: 'VA', Name: 'Holy See' },
    { Code: 'HN', Name: 'Honduras' },
    { Code: 'HK', Name: 'Hong Kong' },
    { Code: 'HU', Name: 'Hungary' },
    { Code: 'IS', Name: 'Iceland' },
    { Code: 'IN', Name: 'India' },
    { Code: 'ID', Name: 'Indonesia' },
    { Code: 'IR', Name: 'Iran' },
    { Code: 'IQ', Name: 'Iraq' },
    { Code: 'IE', Name: 'Ireland' },
    { Code: 'IM', Name: 'Isle of Man' },
    { Code: 'IL', Name: 'Israel' },
    { Code: 'IT', Name: 'Italy' },
    { Code: 'JM', Name: 'Jamaica' },
    { Code: 'JP', Name: 'Japan' },
    { Code: 'JE', Name: 'Jersey' },
    { Code: 'JO', Name: 'Jordan' },
    { Code: 'KZ', Name: 'Kazakhstan' },
    { Code: 'KE', Name: 'Kenya' },
    { Code: 'KI', Name: 'Kiribati' },
    { Code: 'KP', Name: 'Korea, Democratic People\'s Republic of' },
    { Code: 'KR', Name: 'Korea, Republic of' },
    { Code: 'KW', Name: 'Kuwait' },
    { Code: 'KG', Name: 'Kyrgyzstan' },
    { Code: 'LA', Name: "Lao People's Democratic Republic" },
    { Code: 'LV', Name: 'Latvia' },
    { Code: 'LB', Name: 'Lebanon' },
    { Code: 'LS', Name: 'Lesotho' },
    { Code: 'LR', Name: 'Liberia' },
    { Code: 'LY', Name: 'Libya' },
    { Code: 'LI', Name: 'Liechtenstein' },
    { Code: 'LT', Name: 'Lithuania' },
    { Code: 'LU', Name: 'Luxembourg' },
    { Code: 'MO', Name: 'Macao' },
    { Code: 'MG', Name: 'Madagascar' },
    { Code: 'MW', Name: 'Malawi' },
    { Code: 'MY', Name: 'Malaysia' },
    { Code: 'MV', Name: 'Maldives' },
    { Code: 'ML', Name: 'Mali' },
    { Code: 'MT', Name: 'Malta' },
    { Code: 'MH', Name: 'Marshall Islands' },
    { Code: 'MQ', Name: 'Martinique' },
    { Code: 'MR', Name: 'Mauritania' },
    { Code: 'MU', Name: 'Mauritius' },
    { Code: 'YT', Name: 'Mayotte' },
    { Code: 'MX', Name: 'Mexico' },
    { Code: 'FM', Name: 'Micronesia' },
    { Code: 'MD', Name: 'Moldova' },
    { Code: 'MC', Name: 'Monaco' },
    { Code: 'MN', Name: 'Mongolia' },
    { Code: 'ME', Name: 'Montenegro' },
    { Code: 'MS', Name: 'Montserrat' },
    { Code: 'MA', Name: 'Morocco' },
    { Code: 'MZ', Name: 'Mozambique' },
    { Code: 'MM', Name: 'Myanmar' },
    { Code: 'NA', Name: 'Namibia' },
    { Code: 'NR', Name: 'Nauru' },
    { Code: 'NP', Name: 'Nepal' },
    { Code: 'NL', Name: 'Netherlands' },
    { Code: 'NC', Name: 'New Caledonia' },
    { Code: 'NZ', Name: 'New Zealand' },
    { Code: 'NI', Name: 'Nicaragua' },
    { Code: 'NE', Name: 'Niger' },
    { Code: 'NG', Name: 'Nigeria' },
    { Code: 'NU', Name: 'Niue' },
    { Code: 'NF', Name: 'Norfolk Island' },
    { Code: 'MK', Name: 'North Macedonia' },
    { Code: 'MP', Name: 'Northern Mariana Islands' },
    { Code: 'NO', Name: 'Norway' },
    { Code: 'OM', Name: 'Oman' },
    { Code: 'PK', Name: 'Pakistan' },
    { Code: 'PW', Name: 'Palau' },
    { Code: 'PS', Name: 'Palestine, State of' },
    { Code: 'PA', Name: 'Panama' },
    { Code: 'PG', Name: 'Papua New Guinea' },
    { Code: 'PY', Name: 'Paraguay' },
    { Code: 'PE', Name: 'Peru' },
    { Code: 'PH', Name: 'Philippines' },
    { Code: 'PN', Name: 'Pitcairn' },
    { Code: 'PL', Name: 'Poland' },
    { Code: 'PT', Name: 'Portugal' },
    { Code: 'PR', Name: 'Puerto Rico' },
    { Code: 'QA', Name: 'Qatar' },
    { Code: 'RE', Name: 'Réunion' },
    { Code: 'RO', Name: 'Romania' },
    { Code: 'RU', Name: 'Russian Federation' },
    { Code: 'RW', Name: 'Rwanda' },
    { Code: 'BL', Name: 'Saint Barthélemy' },
    { Code: 'SH', Name: 'Saint Helena, Ascension and Tristan da Cunha' },
    { Code: 'KN', Name: 'Saint Kitts and Nevis' },
    { Code: 'LC', Name: 'Saint Lucia' },
    { Code: 'MF', Name: 'Saint Martin (French part)' },
    { Code: 'PM', Name: 'Saint Pierre and Miquelon' },
    { Code: 'VC', Name: 'Saint Vincent and the Grenadines' },
    { Code: 'WS', Name: 'Samoa' },
    { Code: 'SM', Name: 'San Marino' },
    { Code: 'ST', Name: 'Sao Tome and Principe' },
    { Code: 'SA', Name: 'Saudi Arabia' },
    { Code: 'SN', Name: 'Senegal' },
    { Code: 'RS', Name: 'Serbia' },
    { Code: 'SC', Name: 'Seychelles' },
    { Code: 'SL', Name: 'Sierra Leone' },
    { Code: 'SG', Name: 'Singapore' },
    { Code: 'SX', Name: 'Sint Maarten (Dutch part)' },
    { Code: 'SK', Name: 'Slovakia' },
    { Code: 'SI', Name: 'Slovenia' },
    { Code: 'SB', Name: 'Solomon Islands' },
    { Code: 'SO', Name: 'Somalia' },
    { Code: 'ZA', Name: 'South Africa' },
    { Code: 'GS', Name: 'South Georgia and the South Sandwich Islands' },
    { Code: 'SS', Name: 'South Sudan' },
    { Code: 'ES', Name: 'Spain' },
    { Code: 'LK', Name: 'Sri Lanka' },
    { Code: 'SD', Name: 'Sudan' },
    { Code: 'SR', Name: 'Suriname' },
    { Code: 'SJ', Name: 'Svalbard and Jan Mayen' },
    { Code: 'SE', Name: 'Sweden' },
    { Code: 'CH', Name: 'Switzerland' },
    { Code: 'SY', Name: 'Syrian Arab Republic' },
    { Code: 'TW', Name: 'Taiwan' },
    { Code: 'TJ', Name: 'Tajikistan' },
    { Code: 'TZ', Name: 'Tanzania' },
    { Code: 'TH', Name: 'Thailand' },
    { Code: 'TL', Name: 'Timor-Leste' },
    { Code: 'TG', Name: 'Togo' },
    { Code: 'TK', Name: 'Tokelau' },
    { Code: 'TO', Name: 'Tonga' },
    { Code: 'TT', Name: 'Trinidad and Tobago' },
    { Code: 'TN', Name: 'Tunisia' },
    { Code: 'TR', Name: 'Türkiye' },
    { Code: 'TM', Name: 'Turkmenistan' },
    { Code: 'TC', Name: 'Turks and Caicos Islands' },
    { Code: 'TV', Name: 'Tuvalu' },
    { Code: 'UG', Name: 'Uganda' },
    { Code: 'UA', Name: 'Ukraine' },
    { Code: 'AE', Name: 'United Arab Emirates' },
    { Code: 'GB', Name: 'United Kingdom' },
    { Code: 'US', Name: 'United States' },
    { Code: 'UM', Name: 'United States Minor Outlying Islands' },
    { Code: 'UY', Name: 'Uruguay' },
    { Code: 'UZ', Name: 'Uzbekistan' },
    { Code: 'VU', Name: 'Vanuatu' },
    { Code: 'VE', Name: 'Venezuela' },
    { Code: 'VN', Name: 'Viet Nam' },
    { Code: 'VG', Name: 'Virgin Islands (British)' },
    { Code: 'VI', Name: 'Virgin Islands (U.S.)' },
    { Code: 'WF', Name: 'Wallis and Futuna' },
    { Code: 'EH', Name: 'Western Sahara' },
    { Code: 'YE', Name: 'Yemen' },
    { Code: 'ZM', Name: 'Zambia' },
    { Code: 'ZW', Name: 'Zimbabwe' },
];

/** ISO 3166-2 subdivisions, country prefix removed. Only the countries that require one are listed. */
export const BILLING_SUBDIVISIONS: Readonly<Record<string, ReadonlyArray<LocationOption>>> = {
    US: [
        { Code: 'AL', Name: 'Alabama' },
        { Code: 'AK', Name: 'Alaska' },
        { Code: 'AS', Name: 'American Samoa' },
        { Code: 'AZ', Name: 'Arizona' },
        { Code: 'AR', Name: 'Arkansas' },
        { Code: 'CA', Name: 'California' },
        { Code: 'CO', Name: 'Colorado' },
        { Code: 'CT', Name: 'Connecticut' },
        { Code: 'DE', Name: 'Delaware' },
        { Code: 'DC', Name: 'District of Columbia' },
        { Code: 'FL', Name: 'Florida' },
        { Code: 'GA', Name: 'Georgia' },
        { Code: 'GU', Name: 'Guam' },
        { Code: 'HI', Name: 'Hawaii' },
        { Code: 'ID', Name: 'Idaho' },
        { Code: 'IL', Name: 'Illinois' },
        { Code: 'IN', Name: 'Indiana' },
        { Code: 'IA', Name: 'Iowa' },
        { Code: 'KS', Name: 'Kansas' },
        { Code: 'KY', Name: 'Kentucky' },
        { Code: 'LA', Name: 'Louisiana' },
        { Code: 'ME', Name: 'Maine' },
        { Code: 'MD', Name: 'Maryland' },
        { Code: 'MA', Name: 'Massachusetts' },
        { Code: 'MI', Name: 'Michigan' },
        { Code: 'MN', Name: 'Minnesota' },
        { Code: 'MS', Name: 'Mississippi' },
        { Code: 'MO', Name: 'Missouri' },
        { Code: 'MT', Name: 'Montana' },
        { Code: 'NE', Name: 'Nebraska' },
        { Code: 'NV', Name: 'Nevada' },
        { Code: 'NH', Name: 'New Hampshire' },
        { Code: 'NJ', Name: 'New Jersey' },
        { Code: 'NM', Name: 'New Mexico' },
        { Code: 'NY', Name: 'New York' },
        { Code: 'NC', Name: 'North Carolina' },
        { Code: 'ND', Name: 'North Dakota' },
        { Code: 'MP', Name: 'Northern Mariana Islands' },
        { Code: 'OH', Name: 'Ohio' },
        { Code: 'OK', Name: 'Oklahoma' },
        { Code: 'OR', Name: 'Oregon' },
        { Code: 'PA', Name: 'Pennsylvania' },
        { Code: 'PR', Name: 'Puerto Rico' },
        { Code: 'RI', Name: 'Rhode Island' },
        { Code: 'SC', Name: 'South Carolina' },
        { Code: 'SD', Name: 'South Dakota' },
        { Code: 'TN', Name: 'Tennessee' },
        { Code: 'TX', Name: 'Texas' },
        { Code: 'UM', Name: 'United States Minor Outlying Islands' },
        { Code: 'UT', Name: 'Utah' },
        { Code: 'VT', Name: 'Vermont' },
        { Code: 'VI', Name: 'Virgin Islands, U.S.' },
        { Code: 'VA', Name: 'Virginia' },
        { Code: 'WA', Name: 'Washington' },
        { Code: 'WV', Name: 'West Virginia' },
        { Code: 'WI', Name: 'Wisconsin' },
        { Code: 'WY', Name: 'Wyoming' },
    ],
    CA: [
        { Code: 'AB', Name: 'Alberta' },
        { Code: 'BC', Name: 'British Columbia' },
        { Code: 'MB', Name: 'Manitoba' },
        { Code: 'NB', Name: 'New Brunswick' },
        { Code: 'NL', Name: 'Newfoundland and Labrador' },
        { Code: 'NT', Name: 'Northwest Territories' },
        { Code: 'NS', Name: 'Nova Scotia' },
        { Code: 'NU', Name: 'Nunavut' },
        { Code: 'ON', Name: 'Ontario' },
        { Code: 'PE', Name: 'Prince Edward Island' },
        { Code: 'QC', Name: 'Quebec' },
        { Code: 'SK', Name: 'Saskatchewan' },
        { Code: 'YT', Name: 'Yukon' },
    ],
    AU: [
        { Code: 'ACT', Name: 'Australian Capital Territory' },
        { Code: 'NSW', Name: 'New South Wales' },
        { Code: 'NT', Name: 'Northern Territory' },
        { Code: 'QLD', Name: 'Queensland' },
        { Code: 'SA', Name: 'South Australia' },
        { Code: 'TAS', Name: 'Tasmania' },
        { Code: 'VIC', Name: 'Victoria' },
        { Code: 'WA', Name: 'Western Australia' },
    ],
};

/** Postal-code shape for the countries that require one. Elsewhere a postal code is optional. */
const REQUIRED_POSTAL_PATTERNS: Readonly<Record<string, RegExp>> = {
    US: /^\d{5}(-\d{4})?$/,
    CA: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/,
    AU: /^\d{4}$/,
};

/** Matches `Address.PostalCode NVARCHAR(20)`. */
const MAX_POSTAL_CODE_LENGTH = 20;

const COUNTRY_CODES = new Set(BILLING_COUNTRIES.map((c) => c.Code));

/** The subdivisions to offer for a country — empty when the country does not require one. */
export function BillingSubdivisionsFor(countryCode: string | null | undefined): ReadonlyArray<LocationOption> {
    return BILLING_SUBDIVISIONS[(countryCode ?? '').trim().toUpperCase()] ?? [];
}

/** True when the country's sales cannot be placed without a state or province. */
export function BillingSubdivisionRequired(countryCode: string | null | undefined): boolean {
    return BillingSubdivisionsFor(countryCode).length > 0;
}

/** True when the country's postal code is required, and so shape-checked. */
export function BillingPostalCodeRequired(countryCode: string | null | undefined): boolean {
    return (countryCode ?? '').trim().toUpperCase() in REQUIRED_POSTAL_PATTERNS;
}

/**
 * Check a caller-supplied location and normalise it.
 *
 * Accepts only codes from the lists above: a free-text region such as "Illinois" is refused,
 * because a name cannot be matched to a jurisdiction and a mistyped one would silently match none.
 */
export function CheckBillingLocation(input: unknown): BillingLocationCheck {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { Valid: false, Reason: 'A billing country is required.' };
    }
    const raw = input as Record<string, unknown>;
    const country = upperText(raw['Country']);
    if (!country) {
        return { Valid: false, Reason: 'A billing country is required.' };
    }
    if (!COUNTRY_CODES.has(country)) {
        return { Valid: false, Reason: `'${country}' is not an ISO 3166-1 alpha-2 country code.` };
    }

    const region = checkRegion(country, upperText(raw['StateProvince']));
    if (region.Valid === false) return { Valid: false, Reason: region.Reason };

    const postal = checkPostalCode(country, upperText(raw['PostalCode']));
    if (postal.Valid === false) return { Valid: false, Reason: postal.Reason };

    return { Valid: true, Location: { Country: country, StateProvince: region.Value, PostalCode: postal.Value } };
}

type FieldCheck = { Valid: true; Value: string | null } | { Valid: false; Reason: string };

function checkRegion(country: string, region: string | null): FieldCheck {
    const options = BillingSubdivisionsFor(country);
    if (options.length === 0) {
        // No list for this country, so nothing a region could be checked against — it is not stored.
        return { Valid: true, Value: null };
    }
    if (!region) {
        return { Valid: false, Reason: `A state or province is required for ${country}.` };
    }
    // Tolerate the full ISO 3166-2 form ('US-IL') by removing the country prefix.
    const code = region.startsWith(`${country}-`) ? region.slice(country.length + 1) : region;
    if (!options.some((o) => o.Code === code)) {
        return { Valid: false, Reason: `'${region}' is not a state or province code for ${country}.` };
    }
    return { Valid: true, Value: code };
}

function checkPostalCode(country: string, postal: string | null): FieldCheck {
    const pattern = REQUIRED_POSTAL_PATTERNS[country];
    if (!pattern) {
        if (postal && postal.length > MAX_POSTAL_CODE_LENGTH) {
            return { Valid: false, Reason: `A postal code may be at most ${MAX_POSTAL_CODE_LENGTH} characters.` };
        }
        return { Valid: true, Value: postal };
    }
    if (!postal) {
        return { Valid: false, Reason: `A postal code is required for ${country}.` };
    }
    if (!pattern.test(postal)) {
        return { Valid: false, Reason: `'${postal}' is not a valid postal code for ${country}.` };
    }
    return { Valid: true, Value: postal };
}

function upperText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toUpperCase();
    return trimmed.length > 0 ? trimmed : null;
}
