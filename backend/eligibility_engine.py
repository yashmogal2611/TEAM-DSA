"""
eligibility_engine.py
Implements the recommended loan evaluation flow:
Consumer inputs → hard eligibility filtering → document mapping → eligible loans → personalized ranking
"""
from typing import Dict, List, Any, Optional
import math

try:
    from .database import LoanSchemeRule
except ImportError:
    from database import LoanSchemeRule


def calculate_emi(principal: float, annual_rate_pct: float, tenure_months: int) -> float:
    """Standard Reducing Balance EMI Formula."""
    if principal <= 0 or tenure_months <= 0:
        return 0.0
    if annual_rate_pct <= 0:
        return round(principal / tenure_months, 2)
    
    monthly_rate = (annual_rate_pct / 100.0) / 12.0
    numerator = principal * monthly_rate * math.pow(1 + monthly_rate, tenure_months)
    denominator = math.pow(1 + monthly_rate, tenure_months) - 1
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 2)


def calculate_max_loan_from_disposable_income(
    monthly_income: float,
    existing_emi: float,
    max_foir_pct: float,
    annual_rate_pct: float,
    tenure_months: int
) -> float:
    """Calculates maximum loan amount borrower can afford within FOIR limit."""
    max_allowed_total_emi = monthly_income * (max_foir_pct / 100.0)
    available_monthly_emi = max(0.0, max_allowed_total_emi - existing_emi)
    if available_monthly_emi <= 0 or tenure_months <= 0:
        return 0.0

    monthly_rate = (annual_rate_pct / 100.0) / 12.0
    if monthly_rate <= 0:
        return round(available_monthly_emi * tenure_months, 2)

    # Invert EMI formula: P = EMI * ((1+r)^n - 1) / (r * (1+r)^n)
    comp = math.pow(1 + monthly_rate, tenure_months)
    max_p = (available_monthly_emi * (comp - 1)) / (monthly_rate * comp)
    return round(max_p, 2)


def parse_doc_list(doc_text: str) -> List[str]:
    """Parse comma/newline separated document string into clean list."""
    if not doc_text:
        return []
    items = []
    for raw in doc_text.replace("\n", ",").split(","):
        clean = raw.strip()
        if clean:
            items.append(clean)
    return items


def evaluate_loan_eligibility(
    scheme: LoanSchemeRule,
    consumer: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Evaluates a single loan scheme against consumer inputs.
    Returns eligibility flag, match score, calculated EMI, document checklist, and detailed reasons.
    """
    age = consumer.get("age") or 28
    emp_type = (consumer.get("employment_type") or "salaried").lower()
    annual_income = consumer.get("annual_income") or 0.0
    monthly_income = consumer.get("monthly_income") or (annual_income / 12.0 if annual_income > 0 else 0.0)
    credit_score = consumer.get("credit_score") or 700
    existing_emi = consumer.get("existing_emi") or 0.0
    requested_amount = consumer.get("requested_amount") or 500000.0
    tenure_months = consumer.get("preferred_tenure_months") or consumer.get("tenure_months") or 36
    
    co_applicant_income = consumer.get("co_applicant_income") or 0.0
    has_co_applicant = consumer.get("has_co_applicant") or (co_applicant_income > 0)
    effective_monthly_income = monthly_income + (co_applicant_income / 12.0 if co_applicant_income > 0 else 0.0)

    # Dynamic Rate Adjustment based on credit score
    adjusted_rate = scheme.base_interest_rate
    if credit_score >= 750:
        adjusted_rate -= 0.50
    elif credit_score < 650:
        adjusted_rate += 1.50
    adjusted_rate = max(6.5, round(adjusted_rate, 2))

    # Calculate requested EMI
    est_emi = calculate_emi(requested_amount, adjusted_rate, tenure_months)

    # Calculate FOIR
    total_obligation = existing_emi + est_emi
    foir_pct = (total_obligation / effective_monthly_income * 100.0) if effective_monthly_income > 0 else 100.0
    foir_pct = round(foir_pct, 1)

    reasons: List[str] = []
    missing_criteria: List[str] = []
    is_eligible = True
    match_score = 100.0

    # 1. Age check
    if age < scheme.min_age:
        is_eligible = False
        missing_criteria.append(f"Age {age} is below minimum required age of {scheme.min_age} years.")
        match_score -= 30
    elif age > scheme.max_age:
        is_eligible = False
        missing_criteria.append(f"Age {age} exceeds maximum permitted age of {scheme.max_age} years at maturity.")
        match_score -= 30
    else:
        reasons.append(f"Age {age} is within acceptable eligibility range ({scheme.min_age}-{scheme.max_age} yrs).")

    # 2. Credit score check
    if scheme.loan_type != "gold_loan":
        if credit_score < scheme.min_credit_score:
            if credit_score < 600:
                is_eligible = False
                missing_criteria.append(f"Credit score {credit_score} is below minimum threshold of {scheme.min_credit_score}.")
                match_score -= 35
            else:
                missing_criteria.append(f"Credit score {credit_score} is marginal (recommended >= {scheme.min_credit_score}). Higher interest rate may apply.")
                match_score -= 15
        else:
            reasons.append(f"Credit score of {credit_score} qualifies for competitive interest rates.")
    else:
        reasons.append("Gold loan offers flexible credit score acceptance backed by gold collateral.")

    # 3. Income & Repayment capacity check
    if scheme.loan_type == "gold_loan":
        gold_weight = consumer.get("gold_weight_grams") or 0.0
        gold_purity = consumer.get("gold_purity_karats") or 22.0
        # Approx 22k gold rate in India per gram ~ ₹6,500
        gold_rate_per_gram = 6500.0 * (gold_purity / 22.0)
        gold_asset_value = gold_weight * gold_rate_per_gram
        consumer_gold_val = consumer.get("estimated_gold_market_value") or gold_asset_value
        
        max_ltv_allowed = consumer_gold_val * 0.75 # 75% LTV as per RBI guidelines
        if consumer_gold_val <= 0 and gold_weight <= 0:
            reasons.append("Gold ornaments/jewellery (18k-24k) required for physical appraisal.")
            max_eligible = scheme.max_amount
        else:
            max_eligible = min(scheme.max_amount, round(max_ltv_allowed, 2))
            if requested_amount > max_ltv_allowed:
                missing_criteria.append(f"Requested amount ₹{requested_amount:,.0f} exceeds max RBI 75% LTV limit (₹{max_ltv_allowed:,.0f}) based on gold declared.")
                match_score -= 20
            else:
                reasons.append(f"Declared gold value (₹{consumer_gold_val:,.0f}) satisfies loan-to-value (LTV <= 75%) requirement.")

    else:
        # Standard Income check
        effective_annual = effective_monthly_income * 12.0
        if scheme.min_annual_income > 0 and effective_annual < scheme.min_annual_income:
            if not has_co_applicant:
                is_eligible = False
                missing_criteria.append(f"Annual income ₹{effective_annual:,.0f} is below minimum requirement of ₹{scheme.min_annual_income:,.0f}. Adding a co-applicant can bridge this gap.")
                match_score -= 25
            else:
                missing_criteria.append(f"Combined annual income ₹{effective_annual:,.0f} is close to minimum benchmark.")
                match_score -= 10
        else:
            reasons.append(f"Verified monthly income ₹{effective_monthly_income:,.0f} satisfies minimum income benchmarks.")

        # FOIR check
        if foir_pct > scheme.max_foir_percentage:
            if foir_pct > (scheme.max_foir_percentage + 15):
                is_eligible = False
                missing_criteria.append(f"Estimated debt-to-income (FOIR) of {foir_pct}% exceeds maximum safe ceiling of {scheme.max_foir_percentage}%.")
                match_score -= 30
            else:
                missing_criteria.append(f"FOIR {foir_pct}% is slightly high. Increasing tenure from {tenure_months} months will reduce monthly EMI burden.")
                match_score -= 15
        else:
            reasons.append(f"FOIR of {foir_pct}% is healthy and well within {scheme.max_foir_percentage}% limit.")

        max_eligible = calculate_max_loan_from_disposable_income(
            effective_monthly_income,
            existing_emi,
            scheme.max_foir_percentage,
            adjusted_rate,
            tenure_months
        )
        max_eligible = min(scheme.max_amount, max(scheme.min_amount, max_eligible))

    # 4. Loan Specific Criteria checks
    if scheme.loan_type == "education_loan":
        admission_confirmed = consumer.get("admission_confirmed")
        if admission_confirmed is False:
            missing_criteria.append("Confirmed admission / offer letter from recognized university is required for final sanction.")
            match_score -= 15
        else:
            reasons.append("Eligible for student loan scheme with moratorium benefit during study period.")

    elif scheme.loan_type == "business_loan":
        vintage = consumer.get("business_vintage_years") or consumer.get("experience_years") or 1.0
        if vintage < 2.0:
            missing_criteria.append(f"Business vintage is {vintage} years (2+ years operational track record preferred for uncollateralized MSME loans).")
            match_score -= 20
        else:
            reasons.append(f"Established business vintage of {vintage} years qualifies for growth & working capital limits.")

    elif scheme.loan_type == "vehicle_loan":
        down_payment = consumer.get("down_payment_amount") or 0.0
        on_road = consumer.get("vehicle_on_road_price") or requested_amount * 1.15
        if on_road > 0 and (down_payment / on_road) < 0.10:
            missing_criteria.append("Minimum 10% - 15% vehicle down payment / margin money required.")
            match_score -= 10
        else:
            reasons.append("Eligible for up to 85%-90% on-road financing with flexible tenure.")

    # Bound match score between 0 and 100
    match_score = max(0.0, min(100.0, round(match_score, 1)))

    status_str = "eligible"
    if not is_eligible or match_score < 50:
        status_str = "ineligible"
    elif match_score < 75 or len(missing_criteria) > 0:
        status_str = "conditionally_eligible"

    # Map required document checklist
    doc_checklist = {
        "kyc_documents": parse_doc_list(scheme.kyc_documents),
        "income_documents": parse_doc_list(scheme.income_documents),
        "bank_documents": parse_doc_list(scheme.bank_documents),
        "loan_specific_documents": parse_doc_list(scheme.loan_specific_documents),
        "collateral_documents": parse_doc_list(scheme.collateral_documents),
    }

    return {
        "loan_type": scheme.loan_type,
        "display_name": scheme.display_name,
        "is_eligible": is_eligible and match_score >= 50,
        "eligibility_status": status_str,
        "match_score": match_score,
        "estimated_interest_rate": adjusted_rate,
        "estimated_monthly_emi": est_emi,
        "max_eligible_amount": max_eligible,
        "recommended_tenure_months": tenure_months,
        "foir_percentage": foir_pct,
        "reasons": reasons,
        "missing_criteria": missing_criteria,
        "required_documents_checklist": doc_checklist,
        "source_url": scheme.source_url,
        "last_verified": scheme.last_verified,
    }


def rank_and_evaluate_all_loans(
    schemes: List[LoanSchemeRule],
    consumer: Dict[str, Any]
) -> Dict[str, Any]:
    """Runs full consumer pipeline across all schemes and provides ranking & advice."""
    target_type = consumer.get("target_loan_type")
    
    evaluated_items = []
    for scheme in schemes:
        if target_type and scheme.loan_type != target_type:
            continue
        eval_result = evaluate_loan_eligibility(scheme, consumer)
        evaluated_items.append(eval_result)

    # Sort eligible by match_score desc
    eligible = [item for item in evaluated_items if item["is_eligible"]]
    eligible.sort(key=lambda x: x["match_score"], reverse=True)

    ineligible = [item for item in evaluated_items if not item["is_eligible"]]
    ineligible.sort(key=lambda x: x["match_score"], reverse=True)

    # Generate personalized financial advice
    advice = []
    credit_score = consumer.get("credit_score") or 700
    if credit_score < 700:
        advice.append("Improving your credit score above 750 can unlock up to 0.5% - 1.5% lower interest rates.")
    if consumer.get("existing_emi", 0) > 0:
        advice.append("Consolidating high-interest outstanding debt can significantly lower your FOIR and increase borrowing limit.")
    if not consumer.get("has_co_applicant") and len(ineligible) > 0:
        advice.append("Adding an earning co-applicant (parent, spouse) substantially enhances loan approval probability and eligible sanction amount.")

    summary = {
        "age": consumer.get("age"),
        "employment_type": consumer.get("employment_type"),
        "monthly_income": consumer.get("monthly_income") or (consumer.get("annual_income", 0) / 12.0 if consumer.get("annual_income") else 0),
        "credit_score": credit_score,
        "requested_amount": consumer.get("requested_amount"),
        "tenure_months": consumer.get("preferred_tenure_months") or consumer.get("tenure_months") or 36,
    }

    return {
        "consumer_summary": summary,
        "ranked_eligible_loans": eligible,
        "ineligible_loans": ineligible,
        "personalized_advice": advice,
    }
