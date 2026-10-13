import json

from bottle import response


def error_envelope(status: int, code: str, error: str, detail: str | None = None) -> str:
    """Set the response status and return the standard JSON error envelope."""
    response.status = status
    response.content_type = "application/json"
    body = {"status": "error", "code": code, "error": error}
    if detail is not None:
        body["detail"] = detail
    return json.dumps(body)
