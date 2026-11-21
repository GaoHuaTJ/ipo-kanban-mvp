#!/usr/bin/env python3
"""
零依赖一键推送到 GitHub + 开启 GitHub Pages + 开启 Actions 写入权限脚本。
仅使用 Python 标准库与系统自带 git，无需 brew / gh。

用法：
    cd /Users/waltergao/.gemini/antigravity/scratch/ipo-kanban-mvp
    python3 scripts/deploy_github.py
"""

import getpass
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

OWNER = "GaoHuaTJ"
REPO = "ipo-kanban-mvp"
API_BASE = "https://api.github.com"


def gh_api(method, path, token, payload=None):
    url = f"{API_BASE}{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "ipo-kanban-deployer",
            "Content-Type": "application/json",
        },
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
            body = resp.read().decode("utf-8", errors="replace").strip()
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace").strip()
        try:
            err_json = json.loads(body) if body else {}
        except Exception:
            err_json = {"message": body}
        return e.code, err_json


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)

    print("=== GitHub 零成本一键上线工具 ===")
    print("请先在浏览器打开以下链接生成一个 Classic Token（勾选 repo 和 workflow 两项即可）：")
    print("  https://github.com/settings/tokens/new?scopes=repo,workflow&description=ipo-kanban-deploy\n")

    token = getpass.getpass("粘贴你的 GitHub Token（输入时不可见，回车确认）: ").strip()
    if not token:
        print("未输入 Token，已退出。")
        sys.exit(1)

    # 1. 验证身份
    code, me = gh_api("GET", "/user", token)
    if code != 200:
        print(f"Token 验证失败 (HTTP {code}): {me.get('message')}")
        sys.exit(1)
    login = me.get("login") or OWNER
    print(f"[1/5] 登录成功：{login}")

    # 2. 创建公开仓库（若已存在则跳过）
    code, repo_resp = gh_api(
        "POST",
        "/user/repos",
        token,
        {
            "name": REPO,
            "description": "零成本 A股IPO 首发上市全景看板与实时项目详情",
            "private": False,
            "auto_init": False,
        },
    )
    if code in (200, 201):
        print(f"[2/5] 已创建公开仓库：https://github.com/{login}/{REPO}")
    elif code == 422 and "already exists" in json.dumps(repo_resp):
        print(f"[2/5] 仓库 https://github.com/{login}/{REPO} 已存在，直接推送更新")
    else:
        print(f"创建仓库失败 (HTTP {code}): {repo_resp}")
        sys.exit(1)

    # 3. 推送本地 main 分支（使用不落盘的临时认证 URL，推送后还原干净的 origin）
    clean_url = f"https://github.com/{login}/{REPO}.git"
    auth_url = f"https://{login}:{token}@github.com/{login}/{REPO}.git"

    subprocess.run(["git", "remote", "remove", "origin"], stderr=subprocess.DEVNULL)
    subprocess.run(["git", "remote", "add", "origin", clean_url], check=True)

    print("[3/5] 正在推送代码到 GitHub main 分支...")
    push = subprocess.run(["git", "push", "-u", auth_url, "main"], capture_output=True, text=True)
    if push.returncode != 0:
        print("推送失败：", push.stderr)
        sys.exit(1)
    print("      推送成功！")

    # 4. 开启 GitHub Pages（main 分支根目录）
    code, pages_resp = gh_api(
        "POST",
        f"/repos/{login}/{REPO}/pages",
        token,
        {"source": {"branch": "main", "path": "/"}},
    )
    if code in (200, 201):
        print("[4/5] 已开启 GitHub Pages（main / root）")
    elif code == 409:
        print("[4/5] GitHub Pages 已处于开启状态")
    else:
        print(f"[4/5] 开启 Pages 返回 HTTP {code}: {pages_resp.get('message')}（可在仓库 Settings -> Pages 手动确认）")

    # 5. 开启 GitHub Actions 写入权限
    code, act_resp = gh_api(
        "PUT",
        f"/repos/{login}/{REPO}/actions/permissions/workflow",
        token,
        {"default_workflow_permissions": "write", "can_approve_pull_request_reviews": False},
    )
    if code in (200, 204):
        print("[5/5] 已开启 GitHub Actions 读写权限（Read and write permissions）")
    else:
        print(f"[5/5] 设置 Actions 权限返回 HTTP {code}: {act_resp.get('message')}")

    print("\n================ 部署完成 ================")
    print(f"GitHub 仓库：  https://github.com/{login}/{REPO}")
    print(f"Pages 网址：   https://{login.lower()}.github.io/{REPO}/  （约 1~2 分钟生效）")
    print("提示：该 Token 仅用于本次部署，完成后可在 GitHub Settings -> Tokens 中随时删除。")


if __name__ == "__main__":
    main()
